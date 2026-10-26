import type { PipelineStage } from 'mongoose';
import { Event } from '../../models/Event.model.js';
import { ApiError } from '../../lib/api-error.js';
import { publicEventProjection, toPublicEvent } from './discovery.mapper.js';
import type { PublicEventRecord } from './discovery.types.js';
import type { DiscoveryQuery } from './discovery.validation.js';

// Both public entry points enforce the same policy, independently of authentication.
const upcomingPublished = () => ({ status: 'PUBLISHED' as const, startAt: { $gt: new Date(Date.now()) } });

export async function listPublicEvents(input: DiscoveryQuery) {
  const literal = (value: string) => ({ $regex: value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' });
  const visibility = upcomingPublished();
  const filter = {
    ...visibility, startAt: { ...visibility.startAt, ...(input.from ? { $gte: input.from } : {}), ...(input.to ? { $lte: input.to } : {}) },
    ...(input.q ? { $or: [{ title: literal(input.q) }, { venue: literal(input.q) }] } : {}),
    ...(input.venue ? { venue: literal(input.venue) } : {}),
    ...(input.price === 'free' ? { pricePaise: 0 } : input.price === 'paid' ? { pricePaise: { $gt: 0 } } : {})
  };
  const sorts: Record<DiscoveryQuery['sort'], PipelineStage.Sort['$sort']> = {
    soonest: { startAt: 1, _id: 1 }, latest: { startAt: -1, _id: -1 },
    price_asc: { pricePaise: 1, startAt: 1, _id: 1 }, price_desc: { pricePaise: -1, startAt: -1, _id: -1 }
  };
  const [result] = await Event.aggregate<{ events: PublicEventRecord[]; totals: { total: number }[] }>([
    { $match: filter }, { $sort: sorts[input.sort] },
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
