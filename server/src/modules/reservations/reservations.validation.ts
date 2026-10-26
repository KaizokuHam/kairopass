import { z } from 'zod';
import { ApiError } from '../../lib/api-error.js';
import { RESERVATION_STATUSES } from '../../models/Reservation.model.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
export const createReservationSchema = z.object({ eventId: objectId }).strict();
export const emptyBodySchema = z.object({}).strict();
const page = (max: number) => z.string().regex(/^[1-9]\d{0,4}$/).transform(Number).pipe(z.number().int().max(max));
export const listReservationsSchema = z.object({
  page: page(10_000).default(1), limit: page(50).default(10), status: z.enum(RESERVATION_STATUSES).optional()
}).strict();
export type ListReservationsInput = z.infer<typeof listReservationsSchema>;
export function parseReservationInput<T>(value: unknown, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiError(400, 'INVALID_RESERVATION_INPUT', 'Invalid reservation input.');
  return parsed.data;
}
export function reservationId(value: unknown): string {
  const parsed = objectId.safeParse(value);
  if (!parsed.success) throw new ApiError(404, 'RESERVATION_NOT_FOUND', 'Reservation not found.');
  return parsed.data;
}
