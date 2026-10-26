import { timingSafeEqual } from 'node:crypto';
import { Types } from 'mongoose';
import { Event } from '../../models/Event.model.js';
import { Reservation } from '../../models/Reservation.model.js';
import { Ticket, type TicketRecord } from '../../models/Ticket.model.js';
import { PaymentAttempt } from '../../models/PaymentAttempt.model.js';
import { User } from '../../models/User.model.js';
import { ApiError } from '../../lib/api-error.js';
import { verifyTicket, validTicketNonce, type TicketConfig } from '../tickets/tickets.crypto.js';
import { admissionWindow, requireOpenAdmission } from './checkin.policy.js';
import type { CheckInQuery } from './checkin.validation.js';

const invalid = () => new ApiError(404, 'INVALID_TICKET', 'This ticket is not valid for this event.');
const inconsistent = () => new ApiError(503, 'CHECKIN_STATE_UNAVAILABLE', 'Admission state could not be verified. Do not admit without confirmation.');
function validDate(value: unknown): value is Date { return value instanceof Date && Number.isFinite(value.getTime()); }
async function ownedEvent(organizerId: string, eventId: string) {
  const event = await Event.findOne({ _id: eventId, organizerId }).maxTimeMS(2000).lean();
  if (!event) throw new ApiError(404, 'EVENT_NOT_FOUND', 'Event not found.');
  return event;
}
function ticketState(ticket: Pick<TicketRecord, 'status' | 'checkedInAt'>) {
  if (ticket.status === 'USED') {
    if (!validDate(ticket.checkedInAt)) throw inconsistent();
    throw new ApiError(409, 'TICKET_ALREADY_USED', 'Already checked in. Entry denied.', [{ field: 'checkedInAt', message: ticket.checkedInAt.toISOString() }]);
  }
  if (ticket.status === 'REVOKED') throw new ApiError(409, 'TICKET_REVOKED', 'This ticket has been revoked. Entry denied.');
  if (ticket.status !== 'ISSUED' || ticket.checkedInAt !== null) throw inconsistent();
}
export async function admitTicket(organizerId: string, eventId: string, input: string, config: TicketConfig) {
  const verified = verifyTicket(input, config);
  if (!verified) throw new ApiError(400, 'INVALID_QR_PAYLOAD', 'Invalid ticket credential. Entry denied.');
  const event = await ownedEvent(organizerId, eventId);
  // Lean reads never generate a default nonce for a corrupt or historical record.
  const ticket = await Ticket.findById(verified.ticketId).maxTimeMS(2000).lean();
  if (!ticket || !validTicketNonce(ticket.qrNonce) || !timingSafeEqual(Buffer.from(verified.nonce, 'base64url'), Buffer.from(ticket.qrNonce, 'base64url'))) throw invalid();
  const reservation = await Reservation.findOne({ _id: ticket.reservationId, eventId: event._id }).maxTimeMS(2000).lean();
  // Unknown, wrong-event, orphaned and stale-nonce credentials share one privacy boundary.
  if (!reservation) throw invalid();
  ticketState(ticket);
  requireOpenAdmission(event);
  if (reservation.status !== 'CONFIRMED') throw new ApiError(409, 'RESERVATION_NOT_CONFIRMED', 'This reservation is not confirmed. Entry denied.');
  const payments = await PaymentAttempt.find({ reservationId: reservation._id, status: 'SUCCESS' }).select('amountPaise simulationOutcome completedAt').limit(2).maxTimeMS(2000).lean();
  const payment = payments.length === 1 ? payments[0] : undefined;
  if (!payment || payment.simulationOutcome !== 'SUCCESS' || !validDate(payment.completedAt) || !Number.isSafeInteger(reservation.amountPaise) || reservation.amountPaise < 0 || payment.amountPaise !== reservation.amountPaise) {
    throw new ApiError(409, 'PAYMENT_NOT_VERIFIED', 'Successful booking confirmation could not be verified. Entry denied.');
  }
  const attendee = await User.findOne({ _id: reservation.userId, role: 'ATTENDEE' }).select('name').maxTimeMS(2000).lean();
  if (!attendee) throw invalid();
  const window = requireOpenAdmission(event); // Fresh app clock immediately before the only write.
  // Existing contracts freeze published ownership/schedule, CONFIRMED bookings and
  // SUCCESS payments; cancellation cannot pass an active CONFIRMED reservation.
  // A single conditional write therefore consumes only this ticket, without hot
  // event writes or an unnecessary multi-document transaction.
  const checkedIn = await Ticket.findOneAndUpdate({
    _id: ticket._id, reservationId: reservation._id, qrNonce: verified.nonce, status: 'ISSUED',
    checkedInAt: { $eq: null, $exists: true },
    $expr: { $and: [{ $gte: ['$$NOW', new Date(window.opensAt)] }, { $lt: ['$$NOW', new Date(window.closesAt)] }] }
  }, { $set: { status: 'USED' }, $currentDate: { checkedInAt: true, updatedAt: true }, $inc: { __v: 1 } }, {
    returnDocument: 'after', runValidators: true, timestamps: false,
    writeConcern: { w: 'majority', wtimeout: 2000 }, maxTimeMS: 2000, timeoutMS: 5000
  }).lean();
  if (!checkedIn) {
    const current = await Ticket.findOne({ _id: ticket._id, reservationId: reservation._id, qrNonce: verified.nonce }).maxTimeMS(2000).lean();
    if (!current) throw invalid();
    ticketState(current); requireOpenAdmission(event);
    throw new ApiError(409, 'CHECKIN_CONFLICT', 'Admission was not approved. Refresh history and explicitly retry.');
  }
  if (checkedIn.status !== 'USED' || !validDate(checkedIn.checkedInAt)) throw inconsistent();
  return { ticketId: checkedIn._id.toString(), eventId: event._id.toString(), status: 'USED' as const,
    checkedInAt: checkedIn.checkedInAt.toISOString(), attendeeName: attendee.name, eventTitle: event.title };
}

export async function listCheckIns(organizerId: string, eventId: string, input: CheckInQuery) {
  const event = await ownedEvent(organizerId, eventId);
  const [result] = await Reservation.aggregate<{ entries: { ticketId: Types.ObjectId; checkedInAt: Date; attendee: { name: string }[] }[]; totals: { total: number }[] }>([
    { $match: { eventId: event._id } },
    { $lookup: { from: Ticket.collection.name, localField: '_id', foreignField: 'reservationId', pipeline: [{ $match: { status: 'USED', checkedInAt: { $type: 'date' } } }, { $project: { _id: 1, checkedInAt: 1 } }], as: 'ticket' } },
    { $unwind: '$ticket' },
    { $project: { _id: '$ticket._id', ticketId: '$ticket._id', checkedInAt: '$ticket.checkedInAt', userId: 1 } },
    { $sort: { checkedInAt: -1, _id: -1 } },
    { $facet: {
      entries: [{ $skip: (input.page - 1) * input.limit }, { $limit: input.limit },
        { $lookup: { from: User.collection.name, localField: 'userId', foreignField: '_id', pipeline: [{ $project: { _id: 0, name: 1 } }], as: 'attendee' } }],
      totals: [{ $count: 'total' }]
    } }
  ]).option({ maxTimeMS: 2000, readConcern: { level: 'majority' } });
  const total = result?.totals[0]?.total ?? 0;
  return {
    event: { id: event._id.toString(), title: event.title, venue: event.venue, status: event.status, startAt: event.startAt.toISOString(), endAt: event.endAt.toISOString() },
    window: admissionWindow(event),
    checkIns: (result?.entries ?? []).map((entry) => ({ ticketId: entry.ticketId.toString(), eventId: event._id.toString(),
      status: 'USED' as const, checkedInAt: entry.checkedInAt.toISOString(), attendeeName: entry.attendee[0]?.name ?? 'Attendee unavailable', eventTitle: event.title })),
    pagination: { page: input.page, limit: input.limit, total, totalPages: Math.ceil(total / input.limit) }, serverNow: new Date(Date.now()).toISOString()
  };
}
