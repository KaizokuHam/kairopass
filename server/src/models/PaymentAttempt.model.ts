import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import { moneyField, schemaOptions, type TimestampedRecord } from './shared.js';

export const PAYMENT_STATUSES = ['PENDING', 'SUCCESS', 'FAILED'] as const;
export const SIMULATION_OUTCOMES = ['SUCCESS', 'FAILURE'] as const;
export const PAYMENT_FAILURE_REASONS = ['SIMULATED_PAYMENT_FAILURE', 'RESERVATION_EXPIRED', 'RESERVATION_CANCELLED', 'RESERVATION_ALREADY_CONFIRMED', 'EVENT_NOT_PAYABLE', 'PAYMENT_AMOUNT_MISMATCH', 'SIMULATION_REQUEST_UNAVAILABLE'] as const;
/** Simulated payment records only; no real gateway/card data belongs here. */
export interface PaymentAttemptRecord extends TimestampedRecord {
  reservationId: Types.ObjectId;
  transactionId: string;
  idempotencyKey: string;
  amountPaise: number;
  status: typeof PAYMENT_STATUSES[number];
  failureReason?: string;
  /** Optional only for legacy records; every Task 09 attempt binds its original request. */
  simulationOutcome?: typeof SIMULATION_OUTCOMES[number];
  completedAt?: Date;
}
export type PaymentAttemptDocument = HydratedDocument<PaymentAttemptRecord>;

const paymentAttemptSchema = new Schema<PaymentAttemptRecord>({
  reservationId: { type: Schema.Types.ObjectId, ref: 'Reservation', required: true, immutable: true },
  transactionId: { type: String, required: true, trim: true, immutable: true },
  idempotencyKey: { type: String, required: true, trim: true, immutable: true },
  amountPaise: { ...moneyField, immutable: true },
  status: { type: String, enum: PAYMENT_STATUSES, required: true, default: 'PENDING' },
  failureReason: { type: String, trim: true },
  simulationOutcome: { type: String, enum: SIMULATION_OUTCOMES, immutable: true },
  completedAt: { type: Date }
}, schemaOptions);

paymentAttemptSchema.index({ transactionId: 1 }, { name: 'payment_transaction_unique', unique: true });
paymentAttemptSchema.index({ reservationId: 1, idempotencyKey: 1 }, { name: 'payment_idempotency_unique', unique: true });
paymentAttemptSchema.index({ reservationId: 1, createdAt: -1 }, { name: 'payment_reservation_history' });
paymentAttemptSchema.index({ reservationId: 1, createdAt: -1, _id: -1 }, { name: 'payment_reservation_history_stable' });
export const PaymentAttempt = model<PaymentAttemptRecord>('PaymentAttempt', paymentAttemptSchema);
