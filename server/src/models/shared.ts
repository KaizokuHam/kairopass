import type { Types } from 'mongoose';

export interface TimestampedRecord {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const schemaOptions = {
  timestamps: true,
  strict: 'throw',
  autoCreate: false,
  autoIndex: false,
  bufferCommands: false,
  optimisticConcurrency: true
} as const;

export const moneyField = {
  type: Number,
  required: true,
  min: 0,
  validate: {
    validator: Number.isSafeInteger,
    message: 'Amount must be a nonnegative safe integer in paise.'
  }
} as const;
