import mongoose, { Types, type ClientSession } from 'mongoose';
import { Event } from '../../models/Event.model.js';
import { Reservation, type ReservationDocument } from '../../models/Reservation.model.js';
import { User } from '../../models/User.model.js';
import { ApiError } from '../../lib/api-error.js';
import { assertEventInventory, expireEventHolds, HOLD_DURATION_MS, inventoryInconsistent, releaseHeld, reservationTransaction, RECONCILE_BATCH_SIZE } from './reservation-inventory.js';
import { reservationEventProjection, toAttendeeReservation, type AttendeeReservation } from './reservations.mapper.js';
import type { ListReservationsInput } from './reservations.validation.js';

// Internal session-aware contracts shared with payment confirmation; never call controllers.
export { account as requireAttendeeAccount, owned as ownedReservation, mapped as mapReservation, reconcileOwned as reconcileOwnedReservation };

const notFound = () => new ApiError(404, 'RESERVATION_NOT_FOUND', 'Reservation not found.');
const conflict = (code: string, message: string) => new ApiError(409, code, message);
async function account(userId: string, session: ClientSession) {
  const user = await User.findById(userId).select('role').session(session);
  if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  if (user.role !== 'ATTENDEE') throw new ApiError(403, 'FORBIDDEN', 'An attendee account is required.');
}
async function owned(userId: string, id: string, session: ClientSession) {
  const reservation = await Reservation.findOne({ _id: id, userId }).session(session);
  if (!reservation) throw notFound();
  return reservation;
}
async function mapped(reservation: ReservationDocument, session: ClientSession) {
  const event = await Event.findById(reservation.eventId).select(reservationEventProjection).session(session);
  return toAttendeeReservation(reservation, event);
}
export async function createReservation(userId: string, eventId: string) {
  try {
    const result = await reservationTransaction<{ created: boolean; reservation: AttendeeReservation } | { error: ApiError }>(async (session) => {
      await account(userId, session);
      let event = await Event.findById(eventId).session(session);
      if (!event) return { error: new ApiError(404, 'EVENT_NOT_FOUND', 'Event not found.') };
      await assertEventInventory(event, session);
      event = await expireEventHolds(event, userId, new Date(Date.now()), session);
      const active = await Reservation.findOne({ userId, eventId, status: { $in: ['HELD', 'CONFIRMED'] } }).session(session);
      // Queries/reconciliation may cross a boundary. Take the allocation clock
      // after them, then require MongoDB's current clock in the actual write too.
      const now = new Date(Date.now());
      if (active?.status === 'CONFIRMED') return { error: conflict('ALREADY_BOOKED', 'You already have a confirmed reservation for this event.') };
      if (active && active.expiresAt > now) return { created: false, reservation: toAttendeeReservation(active, event) };
      if (active) return { error: conflict('RESERVATION_CONFLICT', 'The hold changed. Check My Reservations before trying again.') };
      if (event.status !== 'PUBLISHED' || event.startAt <= now) return { error: conflict('EVENT_NOT_BOOKABLE', 'This event is no longer available for reservations.') };
      if (event.registrationDeadline <= now) return { error: conflict('REGISTRATION_CLOSED', 'Registration has closed.') };
      const allocated = await Event.findOneAndUpdate({
        _id: event._id, status: 'PUBLISHED', startAt: { $gt: now }, registrationDeadline: { $gt: now },
        reservedCount: event.reservedCount, $expr: { $and: [
          { $lt: ['$reservedCount', '$capacity'] }, { $gt: ['$startAt', '$$NOW'] }, { $gt: ['$registrationDeadline', '$$NOW'] }
        ] }
      }, { $inc: { reservedCount: 1, __v: 1 } }, { session, returnDocument: 'after' });
      if (!allocated) return { error: event.reservedCount >= event.capacity
        ? conflict('EVENT_SOLD_OUT', 'This event is sold out. Refresh availability.')
        : conflict('EVENT_NOT_BOOKABLE', 'This event is no longer available for reservations.') };
      const [reservation] = await Reservation.create([{
        _id: new Types.ObjectId(), userId, eventId, status: 'HELD', amountPaise: allocated.pricePaise,
        expiresAt: new Date(now.getTime() + HOLD_DURATION_MS), createdAt: now, updatedAt: now
      }], { session });
      if (!reservation) throw inventoryInconsistent();
      return { created: true, reservation: toAttendeeReservation(reservation, allocated) };
    });
    // Business rejection commits any legitimate expiry reconciliation. Infrastructure errors abort.
    if ('error' in result) throw result.error;
    return result;
  } catch (error) {
    if (!(error instanceof mongoose.mongo.MongoServerError && error.code === 11000 &&
      error.keyPattern?.userId && error.keyPattern?.eventId)) throw error;
    // The failed insert rolled back its increment. Recognize the winner without retrying allocation.
    return reservationTransaction(async (session) => {
      await account(userId, session);
      const active = await Reservation.findOne({ userId, eventId, status: { $in: ['HELD', 'CONFIRMED'] } }).session(session);
      if (active?.status === 'HELD' && active.expiresAt.getTime() > Date.now()) {
        return { created: false, reservation: await mapped(active, session) };
      }
      throw conflict(active?.status === 'CONFIRMED' ? 'ALREADY_BOOKED' : 'RESERVATION_CONFLICT', 'The reservation changed. Check My Reservations before trying again.');
    });
  }
}

/** Returns true only for the transaction that wins HELD -> EXPIRED. Safe across processes. */
export async function expireReservation(id: string, now = new Date(Date.now())) {
  return reservationTransaction(async (session) => {
    const reservation = await Reservation.findById(id).session(session);
    if (!reservation || reservation.status !== 'HELD' || reservation.expiresAt > now) return false;
    const event = await Event.findById(reservation.eventId).session(session);
    if (!event) throw inventoryInconsistent();
    await assertEventInventory(event, session);
    await releaseHeld(event, [reservation._id], now, 'EXPIRED', session);
    return true;
  });
}

async function reconcileOwned(reservation: ReservationDocument, now: Date, session: ClientSession) {
  if (reservation.status !== 'HELD' || reservation.expiresAt > now) return reservation;
  const event = await Event.findById(reservation.eventId).session(session);
  if (!event) throw inventoryInconsistent();
  await assertEventInventory(event, session);
  await releaseHeld(event, [reservation._id], now, 'EXPIRED', session);
  return owned(reservation.userId.toString(), reservation._id.toString(), session);
}
export async function getReservation(userId: string, id: string) {
  return reservationTransaction(async (session) => {
    await account(userId, session);
    const reservation = await reconcileOwned(await owned(userId, id, session), new Date(Date.now()), session);
    return mapped(reservation, session);
  });
}
export async function cancelReservation(userId: string, id: string) {
  const result = await reservationTransaction<{ reservation: AttendeeReservation } | { error: ApiError }>(async (session) => {
    await account(userId, session);
    let reservation = await owned(userId, id, session);
    const now = new Date(Date.now());
    reservation = await reconcileOwned(reservation, now, session);
    if (reservation.status === 'CONFIRMED') return { error: conflict('RESERVATION_CONFIRMED', 'Confirmed reservations cannot be cancelled here.') };
    if (reservation.status === 'HELD') {
      const event = await Event.findById(reservation.eventId).session(session);
      if (!event) throw inventoryInconsistent();
      await assertEventInventory(event, session);
      await releaseHeld(event, [reservation._id], now, 'CANCELLED', session);
      reservation = await owned(userId, id, session);
    }
    return { reservation: await mapped(reservation, session) };
  });
  if ('error' in result) throw result.error;
  return result.reservation;
}
export async function listReservations(userId: string, input: ListReservationsInput) {
  // Bounded progress through the attendee's backlog before returning a fresh consistent snapshot.
  const due = await Reservation.find({ userId, status: 'HELD', expiresAt: { $lte: new Date(Date.now()) } })
    .select('_id').sort({ expiresAt: 1, _id: 1 }).limit(RECONCILE_BATCH_SIZE).maxTimeMS(2000);
  for (const reservation of due) await expireReservation(reservation._id.toString());
  return reservationTransaction(async (session) => {
    await account(userId, session);
    const now = new Date(Date.now());
    if (await Reservation.exists({ userId, status: 'HELD', expiresAt: { $lte: now } }).session(session)) {
      throw new ApiError(503, 'RESERVATION_RECONCILIATION_PENDING', 'Reservation history is updating. Please refresh shortly.');
    }
    const [result] = await Reservation.aggregate<{ reservations: ReservationDocument[]; totals: { total: number }[] }>([
      { $match: { userId: new Types.ObjectId(userId), ...(input.status ? { status: input.status } : {}) } },
      { $sort: { createdAt: -1, _id: -1 } },
      { $facet: { reservations: [{ $skip: (input.page - 1) * input.limit }, { $limit: input.limit }], totals: [{ $count: 'total' }] } }
    ]).session(session);
    const reservations = [];
    for (const reservation of result?.reservations ?? []) reservations.push(await mapped(reservation, session));
    const total = result?.totals[0]?.total ?? 0;
    return { reservations, pagination: { page: input.page, limit: input.limit, total, totalPages: Math.ceil(total / input.limit) }, serverNow: now.toISOString() };
  });
}
