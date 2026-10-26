import { Types } from 'mongoose';
import { Event, type EventRecord } from '../../models/Event.model.js';
import { ApiError } from '../../lib/api-error.js';
import { completeEventSchema, parseEventInput, type CreateEventInput, type ListEventsInput } from './events.validation.js';
import { toOrganizerEvent } from './events.mapper.js';

export async function createEvent(organizerId: string, input: CreateEventInput) {
  const fields = parseEventInput(input, completeEventSchema);
  if (fields.startAt.getTime() <= Date.now()) throw new ApiError(400, 'INVALID_EVENT_INPUT', 'Event start must be in the future.');
  const event = await Event.create({ ...fields, organizerId, status: 'DRAFT', reservedCount: 0 });
  return toOrganizerEvent(event);
}

export async function ownedEvent(organizerId: string, id: string) {
  const event = await Event.findOne({ _id: id, organizerId });
  if (!event) throw new ApiError(404, 'EVENT_NOT_FOUND', 'Event not found.');
  return event;
}

export async function getEvent(organizerId: string, id: string) {
  return toOrganizerEvent(await ownedEvent(organizerId, id));
}

export async function listEvents(organizerId: string, input: ListEventsInput) {
  const filter = {
    organizerId: new Types.ObjectId(organizerId),
    ...(input.status ? { status: input.status } : {}),
    ...(input.search ? { title: { $regex: input.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } } : {})
  };
  const direction = input.sort === 'oldest' ? 1 : -1;
  // One bounded output stream feeds both page and count, avoiding count/page drift.
  const [result] = await Event.aggregate<{ events: EventRecord[]; totals: { total: number }[] }>([
    { $match: filter }, { $sort: { createdAt: direction, _id: direction } },
    { $facet: {
      events: [{ $skip: (input.page - 1) * input.limit }, { $limit: input.limit }],
      totals: [{ $count: 'total' }]
    } }
  ]).option({ maxTimeMS: 2000 });
  const total = result?.totals[0]?.total ?? 0;
  return {
    events: (result?.events ?? []).map(toOrganizerEvent),
    pagination: { page: input.page, limit: input.limit, total, totalPages: Math.ceil(total / input.limit) }
  };
}
