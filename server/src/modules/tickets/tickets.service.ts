import { randomBytes } from 'node:crypto';
import mongoose, { Types, type ClientSession } from 'mongoose';
import { Event } from '../../models/Event.model.js';
import { Reservation, type ReservationDocument } from '../../models/Reservation.model.js';
import { PaymentAttempt } from '../../models/PaymentAttempt.model.js';
import { Ticket, type TicketRecord } from '../../models/Ticket.model.js';
import { ApiError } from '../../lib/api-error.js';
import { ownedReservation, requireAttendeeAccount } from '../reservations/reservations.service.js';
import { assertEventInventory, reservationTransaction } from '../reservations/reservation-inventory.js';
import { signTicket, validTicketNonce, type TicketConfig } from './tickets.crypto.js';
import type { TicketListInput } from './tickets.validation.js';

type StoredTicket = TicketRecord & { _id: Types.ObjectId };
const unavailable = () => new ApiError(503, 'TICKET_UNAVAILABLE', 'Ticket issuance could not be verified. Check My Tickets before retrying.');
const ineligible = () => new ApiError(409, 'TICKET_NOT_ELIGIBLE', 'A confirmed reservation, verified successful payment and published event are required.');
async function transaction<T>(work: (session: ClientSession) => Promise<T>) {
  try { return await reservationTransaction(work); }
  catch (error) {
    if (error instanceof ApiError && error.code === 'RESERVATION_OUTCOME_UNKNOWN') throw new ApiError(503, 'TICKET_ISSUANCE_UNKNOWN', 'The ticket may have been issued. Check My Tickets or explicitly retry generation.');
    throw error;
  }
}
async function evidence(reservation: ReservationDocument, session: ClientSession) {
  const event = await Event.findById(reservation.eventId).session(session);
  const payments = await PaymentAttempt.find({ reservationId: reservation._id, status: 'SUCCESS' }).limit(2).session(session);
  const payment = payments.length === 1 ? payments[0] : undefined;
  const verified = payment && payment.simulationOutcome === 'SUCCESS' && payment.completedAt instanceof Date &&
    Number.isSafeInteger(reservation.amountPaise) && reservation.amountPaise >= 0 && payment.amountPaise === reservation.amountPaise;
  return { event, payment: verified ? payment : null };
}
async function toTicket(ticket: StoredTicket, reservation: ReservationDocument, session: ClientSession, config?: TicketConfig) {
  if (!['ISSUED', 'USED', 'REVOKED'].includes(ticket.status) || (ticket.status === 'ISSUED' && ticket.checkedInAt !== null)) throw unavailable();
  const { event, payment } = await evidence(reservation, session);
  const admissionState = ticket.status === 'USED' ? 'USED' : ticket.status === 'REVOKED' ? 'REVOKED' :
    !event ? 'EVENT_UNAVAILABLE' : event.status === 'CANCELLED' ? 'EVENT_CANCELLED' : event.status !== 'PUBLISHED' ? 'EVENT_UNAVAILABLE' :
    reservation.status !== 'CONFIRMED' ? 'RESERVATION_INVALID' : !payment ? 'PAYMENT_UNVERIFIED' : 'AVAILABLE';
  // Lean reads are essential: hydration defaults must never invent a nonce on retrieval.
  if (admissionState === 'AVAILABLE' && !validTicketNonce(ticket.qrNonce)) throw unavailable();
  const qrAvailable = admissionState === 'AVAILABLE';
  return {
    id: ticket._id.toString(), reservationId: reservation._id.toString(), status: ticket.status,
    createdAt: ticket.createdAt.toISOString(), updatedAt: ticket.updatedAt.toISOString(), checkedInAt: ticket.checkedInAt?.toISOString() ?? null,
    amountPaise: reservation.amountPaise, admissionState, qrAvailable,
    event: event ? { id: event._id.toString(), title: event.title, venue: event.venue, startAt: event.startAt.toISOString(), endAt: event.endAt.toISOString(), status: event.status } : null,
    ...(config ? { qrPayload: qrAvailable ? signTicket({ v: 1, ticketId: ticket._id.toString(), nonce: ticket.qrNonce }, config) : null } : {})
  };
}
async function eligible(userId: string, id: string, session: ClientSession) {
  await requireAttendeeAccount(userId, session);
  const reservation = await ownedReservation(userId, id, session);
  const { event, payment } = await evidence(reservation, session);
  if (reservation.status !== 'CONFIRMED' || !event || event.status !== 'PUBLISHED' || !payment) throw ineligible();
  return { reservation, event, payment };
}
export async function issueTicket(userId: string, id: string, config: TicketConfig) {
  try {
    return await transaction(async (session) => {
      const { reservation, event, payment } = await eligible(userId, id, session);
      const existing = await Ticket.findOne({ reservationId: reservation._id }).session(session).lean();
      if (existing) return { created: false, ticket: await toTicket(existing, reservation, session, config) };
      await assertEventInventory(event, session);
      // Write every eligibility source in this transaction to prevent snapshot write skew.
      // Version-only writes leave public timestamps, amounts and inventory unchanged.
      const eventWrite = await Event.updateOne({ _id: event._id, status: 'PUBLISHED', __v: event.__v }, { $inc: { __v: 1 } }, { session, timestamps: false });
      const reservationWrite = await Reservation.updateOne({ _id: reservation._id, userId, status: 'CONFIRMED', amountPaise: reservation.amountPaise, __v: reservation.__v }, { $inc: { __v: 1 } }, { session, timestamps: false });
      const paymentWrite = await PaymentAttempt.updateOne({ _id: payment._id, status: 'SUCCESS', simulationOutcome: 'SUCCESS', amountPaise: reservation.amountPaise, __v: payment.__v }, { $inc: { __v: 1 } }, { session, timestamps: false });
      if (!eventWrite.modifiedCount || !reservationWrite.modifiedCount || !paymentWrite.modifiedCount) throw ineligible();
      const [ticket] = await Ticket.create([{ _id: new Types.ObjectId(randomBytes(12)), reservationId: reservation._id }], { session });
      if (!ticket) throw unavailable();
      return { created: true, ticket: await toTicket(ticket.toObject(), reservation, session, config) };
    });
  } catch (error) {
    if (!(error instanceof mongoose.mongo.MongoServerError && error.code === 11000 && error.keyPattern?.reservationId)) throw error;
    // The loser rolled back. Only read the eligible winner; never blindly reinsert.
    return transaction(async (session) => {
      const { reservation } = await eligible(userId, id, session);
      const winner = await Ticket.findOne({ reservationId: reservation._id }).session(session).lean();
      if (!winner) throw unavailable();
      return { created: false, ticket: await toTicket(winner, reservation, session, config) };
    });
  }
}
export async function getTicket(userId: string, id: string, config: TicketConfig) {
  return transaction(async (session) => {
    await requireAttendeeAccount(userId, session);
    const ticket = await Ticket.findById(id).session(session).lean();
    if (!ticket) throw new ApiError(404, 'TICKET_NOT_FOUND', 'Ticket not found.');
    const reservation = await Reservation.findOne({ _id: ticket.reservationId, userId }).session(session);
    if (!reservation) throw new ApiError(404, 'TICKET_NOT_FOUND', 'Ticket not found.');
    return toTicket(ticket, reservation, session, config);
  });
}
export async function listTickets(userId: string, input: TicketListInput) {
  return transaction(async (session) => {
    await requireAttendeeAccount(userId, session);
    const [result] = await Reservation.aggregate<{ tickets: StoredTicket[]; totals: { total: number }[] }>([
      { $match: { userId: new Types.ObjectId(userId), ...(input.reservationId ? { _id: new Types.ObjectId(input.reservationId) } : {}) } },
      { $lookup: { from: Ticket.collection.name, localField: '_id', foreignField: 'reservationId', as: 'ticket' } },
      { $unwind: '$ticket' }, { $replaceWith: '$ticket' },
      ...(input.status ? [{ $match: { status: input.status } }] : []),
      { $sort: { createdAt: -1, _id: -1 } },
      { $facet: { tickets: [{ $skip: (input.page - 1) * input.limit }, { $limit: input.limit }], totals: [{ $count: 'total' }] } }
    ]).session(session).option({ maxTimeMS: 2000 });
    const tickets = [];
    for (const ticket of result?.tickets ?? []) {
      const reservation = await ownedReservation(userId, ticket.reservationId.toString(), session);
      tickets.push(await toTicket(ticket, reservation, session));
    }
    const total = result?.totals[0]?.total ?? 0;
    return { tickets, pagination: { page: input.page, limit: input.limit, total, totalPages: Math.ceil(total / input.limit) } };
  });
}
