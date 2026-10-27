import { Types } from 'mongoose';
import { Event } from '../../models/Event.model.js';
import { ApiError } from '../../lib/api-error.js';
import { reportPipeline } from './analytics.aggregations.js';
import { mapReport } from './analytics.mapper.js';
import type { RawReport } from './analytics.types.js';
import type { AnalyticsQuery } from './analytics.validation.js';
const DAY = 86400000;
export async function analyticsReport(owner: string, input: AnalyticsQuery, includeSeries = true) {
  const generatedAt = new Date(Date.now());
  // One bounded metadata lookup, never materialize all owned IDs in application memory.
  const first = await Event.findOne({ organizerId: owner, ...(input.eventId ? { _id: new Types.ObjectId(input.eventId) } : {}) }).select('createdAt').sort({ createdAt: 1, _id: 1 }).maxTimeMS(2000).lean();
  if (input.eventId && !first) throw new ApiError(404, 'EVENT_NOT_FOUND', 'Event not found.');
  const to = input.to ? new Date(input.to) : generatedAt;
  const days = input.period === '7d' ? 7 : input.period === '90d' ? 90 : 30;
  const earliest = input.period === 'all' && first ? first.createdAt.getTime() : generatedAt.getTime() - (days - 1) * DAY;
  const from = input.from ? new Date(input.from) : new Date(Math.floor(earliest / DAY) * DAY);
  const scope = { from, to, generatedAt, bucketMs: Math.max(1, Math.ceil((to.getTime() - from.getTime()) / DAY / 90)) * DAY };
  const [raw] = await Event.aggregate<RawReport>(reportPipeline(owner, input, scope, includeSeries)).option({ maxTimeMS: 5000, allowDiskUse: false, readConcern: { level: 'snapshot' } });
  return mapReport(raw, scope, input.page, input.limit);
}
