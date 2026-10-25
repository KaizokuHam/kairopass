import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import { moneyField, schemaOptions, type TimestampedRecord } from './shared.js';

export const EVENT_STATUSES = ['DRAFT', 'PUBLISHED', 'CANCELLED'] as const;
export interface EventRecord extends TimestampedRecord {
  organizerId: Types.ObjectId;
  title: string;
  description: string;
  venue: string;
  startAt: Date;
  endAt: Date;
  registrationDeadline: Date;
  capacity: number;
  pricePaise: number;
  status: typeof EVENT_STATUSES[number];
  /** Inventory occupied by HELD + CONFIRMED reservations, never historical totals. */
  reservedCount: number;
}
export type EventDocument = HydratedDocument<EventRecord>;

const eventSchema = new Schema<EventRecord>({
  organizerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: '' },
  venue: { type: String, required: true, trim: true },
  startAt: { type: Date, required: true },
  endAt: { type: Date, required: true },
  registrationDeadline: { type: Date, required: true },
  capacity: {
    type: Number, required: true, min: 1,
    validate: { validator: Number.isSafeInteger, message: 'Capacity must be a positive safe integer.' }
  },
  pricePaise: moneyField,
  status: { type: String, enum: EVENT_STATUSES, required: true, default: 'DRAFT' },
  reservedCount: {
    type: Number, required: true, default: 0, min: 0,
    validate: { validator: Number.isSafeInteger, message: 'Reserved count must be a nonnegative safe integer.' }
  }
}, schemaOptions);

eventSchema.pre('validate', function () {
  if (this.startAt && this.endAt && this.endAt <= this.startAt) {
    this.invalidate('endAt', 'End date must be after start date.');
  }
  if (this.startAt && this.registrationDeadline && this.registrationDeadline > this.startAt) {
    this.invalidate('registrationDeadline', 'Registration deadline must not exceed start date.');
  }
  if (this.reservedCount > this.capacity) {
    this.invalidate('reservedCount', 'Reserved count must not exceed capacity.');
  }
});

eventSchema.index({ organizerId: 1 }, { name: 'event_organizer' });
eventSchema.index({ status: 1, startAt: 1 }, { name: 'event_discovery' });
export const Event = model<EventRecord>('Event', eventSchema);
