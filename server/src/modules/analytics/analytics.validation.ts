import { z } from 'zod';
import { ApiError } from '../../lib/api-error.js';
const integer = (max: number) => z.string().regex(/^[1-9]\d{0,4}$/).transform(Number).pipe(z.number().max(max));
const instant = z.iso.datetime({ offset: true }).refine((s) => Number.isFinite(Date.parse(s)));
export const analyticsQuery = z.object({
  period: z.enum(['7d', '30d', '90d', 'all']).optional(), from: instant.optional(), to: instant.optional(),
  eventId: z.string().regex(/^[a-f\d]{24}$/i).optional(), page: integer(10000).default(1), limit: integer(50).default(10),
  sort: z.enum(['date_asc', 'date_desc', 'bookings', 'revenue', 'checkins']).default('date_desc')
}).strict().refine((v) => !v.from && !v.to || !!v.from && !!v.to && !v.period && Date.parse(v.to) > Date.parse(v.from) && Date.parse(v.to) - Date.parse(v.from) <= 366 * 86400000);
export type AnalyticsQuery = z.infer<typeof analyticsQuery>;
export function parseAnalyticsQuery(input: unknown): AnalyticsQuery {
  const result = analyticsQuery.safeParse(input);
  if (!result.success) throw new ApiError(400, 'INVALID_ANALYTICS_QUERY', 'Use a valid reporting period, owned event and bounded pagination.');
  return result.data;
}
export function analyticsEventId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) throw new ApiError(404, 'EVENT_NOT_FOUND', 'Event not found.');
  return value;
}
