import { z } from 'zod';
import { ApiError } from '../../lib/api-error.js';

const positiveInteger = (maximum: number) => z.string().regex(/^[1-9]\d{0,4}$/)
  .transform(Number).pipe(z.number().int().max(maximum));
// A date without an offset is ambiguous and is deliberately rejected.
const boundary = z.iso.datetime({ offset: true }).transform((value) => new Date(value));
export const discoveryQuerySchema = z.object({
  page: positiveInteger(10_000).default(1), limit: positiveInteger(50).default(12),
  q: z.string().trim().max(120).optional(), venue: z.string().trim().max(200).optional(),
  price: z.enum(['all', 'free', 'paid']).default('all'),
  sort: z.enum(['soonest', 'latest', 'price_asc', 'price_desc']).default('soonest'),
  from: boundary.optional(), to: boundary.optional()
}).strict().refine((value) => !value.from || !value.to || value.from <= value.to, 'From must not be after to.');
export type DiscoveryQuery = z.infer<typeof discoveryQuerySchema>;

export function parseDiscoveryQuery(value: unknown): DiscoveryQuery {
  const parsed = discoveryQuerySchema.safeParse(value);
  if (!parsed.success) throw new ApiError(400, 'INVALID_DISCOVERY_QUERY', 'Invalid event search parameters.');
  return parsed.data;
}

export function parsePublicEventId(value: unknown): string {
  const parsed = z.string().regex(/^[a-f\d]{24}$/i).safeParse(value);
  if (!parsed.success) throw new ApiError(404, 'EVENT_NOT_FOUND', 'Event not found.');
  return parsed.data;
}
