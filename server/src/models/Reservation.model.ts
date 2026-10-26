import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import { moneyField, schemaOptions, type TimestampedRecord } from './shared.js';

export const RESERVATION_STATUSES = ['HELD', 'CONFIRMED', 'EXPIRED', 'CANCELLED'] as const;
export const ACTIVE_RESERVATION_STATUSES = ['HELD', 'CONFIRMED'] as const;
export interface ReservationRecord extends TimestampedRecord {
  userId: Types.ObjectId;
  eventId: Types.ObjectId;
  status: typeof RESERVATION_STATUSES[number];
  expiresAt: Date;
  amountPaise: number;
}
export type ReservationDocument = HydratedDocument<ReservationRecord>;

const reservationSchema = new Schema<ReservationRecord>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true, immutable: true },
  status: { type: String, enum: RESERVATION_STATUSES, required: true, default: 'HELD' },
  expiresAt: { type: Date, required: true },
  amountPaise: { ...moneyField, immutable: true }
}, schemaOptions);

reservationSchema.index({ userId: 1, eventId: 1 }, {
  name: 'reservation_active_user_event_unique',
  unique: true,
  partialFilterExpression: { status: { $in: [...ACTIVE_RESERVATION_STATUSES] } }
});
// Supports explicit expiration sweeps. Never use a TTL: retain booking history.
reservationSchema.index({ status: 1, expiresAt: 1 }, { name: 'reservation_expiration_scan' });
// Cancellation must check active bookings by event, even if its inventory counter is inconsistent.
reservationSchema.index({ eventId: 1, status: 1 }, { name: 'reservation_event_status' });
export const Reservation = model<ReservationRecord>('Reservation', reservationSchema);
