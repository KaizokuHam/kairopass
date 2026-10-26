import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import { schemaOptions, type TimestampedRecord } from './shared.js';

export interface AuthSessionRecord extends TimestampedRecord {
  userId: Types.ObjectId;
  jtiHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}
export type AuthSessionDocument = HydratedDocument<AuthSessionRecord>;

const authSessionSchema = new Schema<AuthSessionRecord>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  jtiHash: { type: String, required: true, immutable: true, match: /^[a-f0-9]{64}$/ },
  expiresAt: { type: Date, required: true, immutable: true },
  revokedAt: { type: Date, default: null }
}, schemaOptions);

authSessionSchema.index({ jtiHash: 1 }, { name: 'auth_session_jti_unique', unique: true });
authSessionSchema.index({ userId: 1 }, { name: 'auth_session_user' });
// TTL cleanup is safe for sessions only. Requests independently check expiry/revocation.
authSessionSchema.index({ expiresAt: 1 }, { name: 'auth_session_expiration', expireAfterSeconds: 0 });
export const AuthSession = model<AuthSessionRecord>('AuthSession', authSessionSchema);
