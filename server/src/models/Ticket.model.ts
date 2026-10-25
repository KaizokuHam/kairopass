import { randomBytes } from 'node:crypto';
import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import { schemaOptions, type TimestampedRecord } from './shared.js';

export const TICKET_STATUSES = ['ISSUED', 'USED', 'REVOKED'] as const;
export interface TicketRecord extends TimestampedRecord {
  reservationId: Types.ObjectId;
  qrNonce: string;
  status: typeof TICKET_STATUSES[number];
  checkedInAt: Date | null;
}
export type TicketDocument = HydratedDocument<TicketRecord>;

const ticketSchema = new Schema<TicketRecord>({
  reservationId: { type: Schema.Types.ObjectId, ref: 'Reservation', required: true, immutable: true },
  qrNonce: {
    type: String, required: true, immutable: true,
    default: () => randomBytes(32).toString('base64url'),
    match: /^[A-Za-z0-9_-]{43}$/
  },
  status: { type: String, enum: TICKET_STATUSES, required: true, default: 'ISSUED' },
  checkedInAt: { type: Date, default: null }
}, schemaOptions);

ticketSchema.pre('validate', function () {
  if (this.status === 'USED' && !this.checkedInAt) {
    this.invalidate('checkedInAt', 'A used ticket requires a check-in timestamp.');
  }
  if (this.status === 'ISSUED' && this.checkedInAt !== null) {
    this.invalidate('checkedInAt', 'An issued ticket cannot already be checked in.');
  }
});

ticketSchema.index({ reservationId: 1 }, { name: 'ticket_reservation_unique', unique: true });
ticketSchema.index({ qrNonce: 1 }, { name: 'ticket_nonce_unique', unique: true });
export const Ticket = model<TicketRecord>('Ticket', ticketSchema);
