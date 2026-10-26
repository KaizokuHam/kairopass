import mongoose, { type ClientSession, type Types } from 'mongoose';
import { Event, type EventDocument } from '../../models/Event.model.js';
import { ACTIVE_RESERVATION_STATUSES, Reservation } from '../../models/Reservation.model.js';
import { ApiError } from '../../lib/api-error.js';

export const HOLD_DURATION_MS = 10 * 60 * 1000;
export const RECONCILE_BATCH_SIZE = 100;
export const inventoryInconsistent = () => new ApiError(503, 'INVENTORY_INCONSISTENT', 'Inventory could not be verified. Please try again later.');

/** Driver retries labelled transient/uncertain commits within one total deadline. No side effects in work. */
export async function reservationTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.connection.startSession();
  try {
    return await session.withTransaction(work, {
      readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary',
      timeoutMS: 8000, maxCommitTimeMS: 2000
    });
  } catch (error) {
    if (error instanceof mongoose.mongo.MongoError &&
      (error.hasErrorLabel('UnknownTransactionCommitResult') || error.name === 'MongoOperationTimeoutError')) {
      throw new ApiError(503, 'RESERVATION_OUTCOME_UNKNOWN', 'This operation may have completed. Check My Reservations before trying again.');
    }
    throw error;
  } finally { await session.endSession(); }
}

/** Same snapshot as writes: detect corruption rather than concealing it with a decrement clamp. */
export async function assertEventInventory(event: EventDocument, session: ClientSession) {
  if (!Number.isSafeInteger(event.capacity) || event.capacity < 1 ||
    !Number.isSafeInteger(event.reservedCount) || event.reservedCount < 0 || event.reservedCount > event.capacity ||
    !Number.isSafeInteger(event.pricePaise) || event.pricePaise < 0) throw inventoryInconsistent();
  const active = await Reservation.countDocuments({ eventId: event._id, status: { $in: [...ACTIVE_RESERVATION_STATUSES] } }).session(session);
  if (active !== event.reservedCount) throw inventoryInconsistent();
}

/** Only successful conditional state transitions own capacity release; both writes commit together. */
export async function releaseHeld(event: EventDocument, ids: Types.ObjectId[], now: Date,
  status: 'EXPIRED' | 'CANCELLED', session: ClientSession): Promise<EventDocument> {
  if (!ids.length) return event;
  const result = await Reservation.updateMany({
    _id: { $in: ids }, eventId: event._id, status: 'HELD',
    expiresAt: status === 'EXPIRED' ? { $lte: now } : { $gt: now }
  }, { $set: { status, updatedAt: now }, $inc: { __v: 1 } }, { session });
  if (!result.modifiedCount) return event;
  if (event.reservedCount < result.modifiedCount) throw inventoryInconsistent();
  const updated = await Event.findOneAndUpdate({ _id: event._id, reservedCount: event.reservedCount }, {
    $inc: { reservedCount: -result.modifiedCount, __v: 1 }
  }, { session, returnDocument: 'after' });
  if (!updated) throw inventoryInconsistent();
  return updated;
}

export async function expireEventHolds(event: EventDocument, userId: string, now: Date, session: ClientSession) {
  const due = await Reservation.find({ eventId: event._id, status: 'HELD', expiresAt: { $lte: now } })
    .select('_id').sort({ expiresAt: 1, _id: 1 }).limit(RECONCILE_BATCH_SIZE).session(session);
  // Include this attendee's elapsed hold even when a large backlog fills the bounded event batch.
  const own = await Reservation.findOne({ eventId: event._id, userId, status: 'HELD', expiresAt: { $lte: now } }).select('_id').session(session);
  const ids = due.map((r) => r._id);
  if (own && !ids.some((id) => id.equals(own._id))) ids.push(own._id);
  return releaseHeld(event, ids, now, 'EXPIRED', session);
}
