import { z } from 'zod';
import { ApiError } from '../../lib/api-error.js';

const positiveInteger = (maximum: number) => z.string().regex(/^[1-9]\d{0,4}$/)
  .transform(Number).pipe(z.number().int().max(maximum));
export const discoveryQuerySchema = z.object({
  page: positiveInteger(10_000).default(1), limit: positiveInteger(50).default(12)
}).strict();
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
