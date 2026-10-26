import { z } from 'zod';
import { ApiError } from '../../lib/api-error.js';
import { MAX_TICKET_PAYLOAD_LENGTH } from '../tickets/tickets.crypto.js';
export const checkInBody = z.object({ qrPayload: z.string().min(1).max(MAX_TICKET_PAYLOAD_LENGTH) }).strict();
const page = (max: number) => z.string().regex(/^[1-9]\d{0,4}$/).transform(Number).pipe(z.number().int().max(max));
export const checkInQuery = z.object({ page: page(10000).default(1), limit: page(50).default(10) }).strict();
export type CheckInQuery = z.infer<typeof checkInQuery>;
export function checkInInput<T>(input: unknown, schema: z.ZodType<T>): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ApiError(400, 'INVALID_CHECKIN_INPUT', 'Provide a complete signed QR credential or valid history pagination.');
  return result.data;
}
export function checkInEventId(input: unknown) {
  if (typeof input !== 'string' || !/^[a-f\d]{24}$/i.test(input)) throw new ApiError(404, 'EVENT_NOT_FOUND', 'Event not found.');
  return input;
}
