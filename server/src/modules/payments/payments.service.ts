import { randomUUID } from 'node:crypto';
import mongoose, { Types, type ClientSession } from 'mongoose';
import { Event } from '../../models/Event.model.js';
import { Reservation, type ReservationDocument } from '../../models/Reservation.model.js';
import { PaymentAttempt, type PaymentAttemptDocument } from '../../models/PaymentAttempt.model.js';
import { ApiError } from '../../lib/api-error.js';
import { requireAttendeeAccount, ownedReservation, mapReservation, reconcileOwnedReservation } from '../reservations/reservations.service.js';
import { assertEventInventory, reservationTransaction } from '../reservations/reservation-inventory.js';
import { toAttendeePayment } from './payments.mapper.js';
import type { PaymentHistoryInput, PaymentInput } from './payments.validation.js';

const conflict = (code: string, message: string) => new ApiError(409, code, message);
const inconsistent = () => new ApiError(503, 'PAYMENT_INCONSISTENT', 'The payment state could not be verified. Please check its status later.');
class ConfirmationBoundaryChanged extends Error {}
async function paymentTransaction<T>(work: (session: ClientSession) => Promise<T>) {
  try { return await reservationTransaction(work); }
  catch (error) {
    if (error instanceof ApiError && error.code === 'RESERVATION_OUTCOME_UNKNOWN') {
      throw new ApiError(503, 'PAYMENT_OUTCOME_UNKNOWN', 'The payment may have completed. Check its status or resume with the same idempotency key.');
    }
    throw error;
  }
}
/** A clock boundary crossed between serial writes: abort, then re-evaluate once from fresh state. */
async function retryBoundary<T>(work: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await work(); }
    catch (error) { if (!(error instanceof ConfirmationBoundaryChanged)) throw error; }
  }
  throw conflict('PAYMENT_CONFIRMATION_CONFLICT', 'The reservation changed. Check payment status before trying again.');
}
function sameRequest(payment: PaymentAttemptDocument, input: PaymentInput) {
  if (payment.simulationOutcome !== input.simulationOutcome) {
    throw conflict('PAYMENT_IDEMPOTENCY_CONFLICT', 'This idempotency key belongs to a different or legacy request. Use its original request.');
  }
}
function notPayable(reservation: ReservationDocument) {
  if (reservation.status === 'EXPIRED') return conflict('RESERVATION_EXPIRED', 'Your reservation hold has expired.');
  if (reservation.status === 'CONFIRMED') return conflict('RESERVATION_ALREADY_CONFIRMED', 'This reservation is already confirmed.');
  return conflict('RESERVATION_NOT_PAYABLE', 'This reservation is not available for checkout.');
}
async function eventForPayment(reservation: ReservationDocument, session: ClientSession) {
  const event = await Event.findById(reservation.eventId).session(session);
  if (!event) throw inconsistent();
  await assertEventInventory(event, session);
  if (!Number.isSafeInteger(reservation.amountPaise) || reservation.amountPaise < 0) throw inconsistent();
  return event;
}
async function response(payment: PaymentAttemptDocument, reservation: ReservationDocument, session: ClientSession) {
  if (payment.status === 'SUCCESS' && (reservation.status !== 'CONFIRMED' || payment.amountPaise !== reservation.amountPaise)) throw inconsistent();
  return { payment: toAttendeePayment(payment), reservation: await mapReservation(reservation, session), serverNow: new Date(Date.now()).toISOString() };
}

/** First durable stage. A crash after this commit leaves a resumable PENDING request. */
export async function preparePayment(userId: string, reservationId: string, key: string, input: PaymentInput) {
  const transactionId = 'sim_' + randomUUID();
  try {
    const prepared = await retryBoundary(() => paymentTransaction(async (session) => {
      await requireAttendeeAccount(userId, session);
      let reservation = await ownedReservation(userId, reservationId, session);
      const existing = await PaymentAttempt.findOne({ reservationId, idempotencyKey: key }).session(session);
      if (existing) { sameRequest(existing, input); return { id: existing._id.toString() }; }
      reservation = await reconcileOwnedReservation(reservation, new Date(Date.now()), session);
      if (reservation.status !== 'HELD') return { error: notPayable(reservation) };
      const event = await eventForPayment(reservation, session), now = new Date(Date.now());
      if (event.status !== 'PUBLISHED' || event.startAt <= now) return { error: conflict('RESERVATION_NOT_PAYABLE', 'The event is no longer available for checkout.') };
      // Touch the reservation to serialize creation with cancellation/expiry without changing its hold.
      const eligible = await Reservation.updateOne({ _id: reservation._id, userId, status: 'HELD', expiresAt: { $gt: now },
        $expr: { $gt: ['$expiresAt', '$$NOW'] }
      }, { $inc: { __v: 1 } }, { session });
      if (!eligible.modifiedCount) throw new ConfirmationBoundaryChanged();
      const [payment] = await PaymentAttempt.create([{
        reservationId, idempotencyKey: key, transactionId, amountPaise: reservation.amountPaise,
        simulationOutcome: input.simulationOutcome, status: 'PENDING'
      }], { session });
      if (!payment) throw inconsistent();
      return { id: payment._id.toString() };
    }));
    if (prepared.error) throw prepared.error;
    return prepared.id!;
  } catch (error) {
    if (!(error instanceof mongoose.mongo.MongoServerError && error.code === 11000 && error.keyPattern?.reservationId && error.keyPattern?.idempotencyKey)) throw error;
    // Unique-key loser rolled back. Read its durable winner; never reinsert blindly.
    return paymentTransaction(async (session) => {
      await requireAttendeeAccount(userId, session); await ownedReservation(userId, reservationId, session);
      const winner = await PaymentAttempt.findOne({ reservationId, idempotencyKey: key }).session(session);
      if (!winner) throw inconsistent(); sameRequest(winner, input); return winner._id.toString();
    });
  }
}

/** Second stage: SUCCESS and CONFIRMED commit together. No additional capacity is allocated. */
export async function finalizePayment(userId: string, reservationId: string, paymentId: string) {
  return retryBoundary(() => paymentTransaction(async (session) => {
    await requireAttendeeAccount(userId, session);
    let reservation = await ownedReservation(userId, reservationId, session);
    const payment = await PaymentAttempt.findOne({ _id: paymentId, reservationId }).session(session);
    if (!payment) throw new ApiError(404, 'PAYMENT_ATTEMPT_NOT_FOUND', 'Payment attempt not found.');
    if (payment.status !== 'PENDING') return response(payment, reservation, session);
    reservation = await reconcileOwnedReservation(reservation, new Date(Date.now()), session);
    let failureReason: string | undefined;
    if (reservation.status === 'EXPIRED') failureReason = 'RESERVATION_EXPIRED';
    else if (reservation.status === 'CANCELLED') failureReason = 'RESERVATION_CANCELLED';
    else if (reservation.status === 'CONFIRMED') failureReason = 'RESERVATION_ALREADY_CONFIRMED';
    else if (payment.amountPaise !== reservation.amountPaise) failureReason = 'PAYMENT_AMOUNT_MISMATCH';
    else if (!payment.simulationOutcome) failureReason = 'SIMULATION_REQUEST_UNAVAILABLE';
    else {
      const event = await eventForPayment(reservation, session);
      let now = new Date(Date.now());
      if (event.status !== 'PUBLISHED' || event.startAt <= now) failureReason = 'EVENT_NOT_PAYABLE';
      else {
        // Event write serializes eligibility with organizer state changes; never increment its counter.
        const eligible = await Event.updateOne({ _id: event._id, status: 'PUBLISHED', startAt: { $gt: now },
          reservedCount: event.reservedCount, $expr: { $gt: ['$startAt', '$$NOW'] }
        }, { $inc: { __v: 1 } }, { session });
        if (!eligible.modifiedCount) throw new ConfirmationBoundaryChanged();
        if (await PaymentAttempt.exists({ reservationId, status: 'SUCCESS' }).session(session)) throw inconsistent();
        const finalStatus = payment.simulationOutcome === 'SUCCESS' ? 'SUCCESS' : 'FAILED';
        const updated = await PaymentAttempt.findOneAndUpdate({ _id: payment._id, status: 'PENDING', amountPaise: reservation.amountPaise }, {
          $set: { status: finalStatus, ...(finalStatus === 'FAILED' ? { failureReason: 'SIMULATED_PAYMENT_FAILURE' } : {}), completedAt: now }, $inc: { __v: 1 }
        }, { session, returnDocument: 'after' });
        if (!updated) throw inconsistent();
        // Re-read the clock AFTER the preceding writes, at the authoritative transition.
        now = new Date(Date.now());
        if (event.startAt <= now) throw new ConfirmationBoundaryChanged();
        const transitioned = await Reservation.findOneAndUpdate({ _id: reservation._id, userId, status: 'HELD',
          expiresAt: { $gt: now }, $expr: { $gt: ['$expiresAt', '$$NOW'] }
        }, { ...(finalStatus === 'SUCCESS' ? { $set: { status: 'CONFIRMED' } } : {}), $inc: { __v: 1 } }, { session, returnDocument: 'after' });
        if (!transitioned) throw new ConfirmationBoundaryChanged();
        return response(updated, transitioned, session);
      }
    }
    const failed = await PaymentAttempt.findOneAndUpdate({ _id: payment._id, status: 'PENDING' }, {
      $set: { status: 'FAILED', failureReason, completedAt: new Date(Date.now()) }, $inc: { __v: 1 }
    }, { session, returnDocument: 'after' });
    if (!failed) throw inconsistent();
    return response(failed, reservation, session);
  }));
}
export async function processPayment(userId: string, reservationId: string, key: string, input: PaymentInput) {
  const id = await preparePayment(userId, reservationId, key, input);
  return finalizePayment(userId, reservationId, id);
}
export async function getPayment(userId: string, reservationId: string, paymentId: string) {
  return paymentTransaction(async (session) => {
    await requireAttendeeAccount(userId, session); const reservation = await ownedReservation(userId, reservationId, session);
    const payment = await PaymentAttempt.findOne({ _id: paymentId, reservationId }).session(session);
    if (!payment) throw new ApiError(404, 'PAYMENT_ATTEMPT_NOT_FOUND', 'Payment attempt not found.');
    return response(payment, reservation, session);
  });
}
export async function listPayments(userId: string, reservationId: string, input: PaymentHistoryInput) {
  return paymentTransaction(async (session) => {
    await requireAttendeeAccount(userId, session); const reservation = await ownedReservation(userId, reservationId, session);
    const [result] = await PaymentAttempt.aggregate<{ payments: PaymentAttemptDocument[]; totals: { total: number }[] }>([
      { $match: { reservationId: new Types.ObjectId(reservationId), ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}) } },
      { $sort: { createdAt: -1, _id: -1 } },
      { $facet: { payments: [{ $skip: (input.page - 1) * input.limit }, { $limit: input.limit }], totals: [{ $count: 'total' }] } }
    ]).session(session);
    const total = result?.totals[0]?.total ?? 0;
    return { payments: (result?.payments ?? []).map(toAttendeePayment), reservation: await mapReservation(reservation, session),
      pagination: { page: input.page, limit: input.limit, total, totalPages: Math.ceil(total / input.limit) }, serverNow: new Date(Date.now()).toISOString() };
  });
}
