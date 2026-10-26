import { Event } from '../../models/Event.model.js';
import { ApiError } from '../../lib/api-error.js';
import { publicEventProjection, toPublicEvent } from './discovery.mapper.js';
import type { PublicEventRecord } from './discovery.types.js';
import type { DiscoveryQuery } from './discovery.validation.js';

// Both public entry points enforce the same policy, independently of authentication.
const upcomingPublished = () => ({ status: 'PUBLISHED' as const, startAt: { $gt: new Date(Date.now()) } });

export async function listPublicEvents(input: DiscoveryQuery) {
  const [result] = await Event.aggregate<{ events: PublicEventRecord[]; totals: { total: number }[] }>([
    { $match: upcomingPublished() }, { $sort: { startAt: 1, _id: 1 } },
    { $project: publicEventProjection },
    { $facet: {
      events: [{ $skip: (input.page - 1) * input.limit }, { $limit: input.limit }],
      totals: [{ $count: 'total' }]
    } }
  ]).option({ maxTimeMS: 2000 });
  const total = result?.totals[0]?.total ?? 0;
  return { events: (result?.events ?? []).map(toPublicEvent),
    pagination: { page: input.page, limit: input.limit, total, totalPages: Math.ceil(total / input.limit) } };
}

export async function getPublicEvent(id: string) {
  const event = await Event.findOne({ _id: id, ...upcomingPublished() })
    .select(publicEventProjection).maxTimeMS(2000).lean<PublicEventRecord>();
  if (!event) throw new ApiError(404, 'EVENT_NOT_FOUND', 'Event not found.');
  return toPublicEvent(event);
}
