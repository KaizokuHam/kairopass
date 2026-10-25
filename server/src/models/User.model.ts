import { Schema, model, type HydratedDocument } from 'mongoose';
import { schemaOptions, type TimestampedRecord } from './shared.js';

export const USER_ROLES = ['ATTENDEE', 'ORGANIZER'] as const;
export interface UserRecord extends TimestampedRecord {
  name: string;
  email: string;
  passwordHash: string;
  role: typeof USER_ROLES[number];
}
export type UserDocument = HydratedDocument<UserRecord>;

function hidePassword(_document: unknown, result: Record<string, unknown>) {
  Reflect.deleteProperty(result, 'passwordHash');
  return result;
}

const userSchema = new Schema<UserRecord>({
  name: { type: String, required: true, trim: true },
  email: {
    type: String, required: true, trim: true, lowercase: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: USER_ROLES, required: true, default: 'ATTENDEE' }
}, {
  ...schemaOptions,
  toJSON: { transform: hidePassword },
  toObject: { transform: hidePassword }
});

userSchema.index({ email: 1 }, { name: 'user_email_unique', unique: true });
export const User = model<UserRecord>('User', userSchema);
