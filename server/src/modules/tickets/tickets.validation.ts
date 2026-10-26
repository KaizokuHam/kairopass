import { z } from 'zod';
import { ApiError } from '../../lib/api-error.js';
import { TICKET_STATUSES } from '../../models/Ticket.model.js';
const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const page = (max: number) => z.string().regex(/^[1-9]\d{0,4}$/).transform(Number).pipe(z.number().int().max(max));
export const ticketListSchema = z.object({ page: page(10000).default(1), limit: page(50).default(10), status: z.enum(TICKET_STATUSES).optional(), reservationId: objectId.optional() }).strict();
export const ticketBodySchema = z.object({}).strict();
export type TicketListInput = z.infer<typeof ticketListSchema>;
export function ticketInput<T>(value: unknown, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiError(400, 'TICKET_INVALID_INPUT', 'Invalid ticket input.');
  return parsed.data;
}
export function ticketId(value: unknown): string {
  const parsed = objectId.safeParse(value);
  if (!parsed.success) throw new ApiError(404, 'TICKET_NOT_FOUND', 'Ticket not found.');
  return parsed.data;
}
