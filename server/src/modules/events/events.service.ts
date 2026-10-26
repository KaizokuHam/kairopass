import mongoose, { Types, type ClientSession } from 'mongoose';
import { Event, type EventDocument, type EventRecord } from '../../models/Event.model.js';
import { ACTIVE_RESERVATION_STATUSES, Reservation } from '../../models/Reservation.model.js';
import { ApiError } from '../../lib/api-error.js';
import { completeEventSchema, parseEventInput, type CreateEventInput, type ListEventsInput, type UpdateEventInput } from './events.validation.js';
import { toOrganizerEvent } from './events.mapper.js';

export async function createEvent(organizerId: string, input: CreateEventInput) {
  const fields = parseEventInput(input, completeEventSchema);
  if (fields.startAt.getTime() <= Date.now()) throw new ApiError(400, 'INVALID_EVENT_INPUT', 'Event start must be in the future.');
  const event = await Event.create({ ...fields, organizerId, status: 'DRAFT', reservedCount: 0 });
  return toOrganizerEvent(event);
}

async function ownedEvent(organizerId: string, id: string, session?: ClientSession) {
  const event = await Event.findOne({ _id: id, organizerId }).session(session ?? null);
  if (!event) throw new ApiError(404, 'EVENT_NOT_FOUND', 'Event not found.');
  return event;
}

async function validateResult(event: EventDocument, input: UpdateEventInput, publishing = false) {
  const status = publishing ? 409 : 400;
  const code = publishing ? 'EVENT_NOT_PUBLISHABLE' : 'INVALID_EVENT_INPUT';
  const fields = parseEventInput({ ...event.toObject(), ...input }, completeEventSchema, status, code);
  if (!Number.isSafeInteger(event.reservedCount) || event.reservedCount < 0 || event.reservedCount > fields.capacity) {
    throw new ApiError(status, code, 'Capacity must cover the existing reserved inventory.');
  }
  event.set(input);
  await event.validate(); // Query validators alone do not run cross-field document hooks.
  return fields;
}

async function conditionalWrite(event: EventDocument, fields: UpdateEventInput | { status: EventRecord['status'] }, session?: ClientSession) {
  const publishing = 'status' in fields && fields.status === 'PUBLISHED';
  const now = new Date(Date.now());
  const updated = await Event.findOneAndUpdate({
    _id: event._id, organizerId: event.organizerId, status: event.status,
    __v: event.__v ?? { $exists: false }, reservedCount: event.reservedCount,
    ...(publishing ? { startAt: { $gt: now }, registrationDeadline: { $gt: now } } : {})
  }, { $set: fields, $inc: { __v: 1 } }, { returnDocument: 'after', runValidators: true, ...(session ? { session } : {}) });
  if (!updated) throw new ApiError(409, 'EVENT_UPDATE_CONFLICT', 'The event changed. Reload it before trying again.');
  return toOrganizerEvent(updated);
}

export async function updateEvent(organizerId: string, id: string, input: UpdateEventInput) {
  const event = await ownedEvent(organizerId, id);
  if (event.status !== 'DRAFT' && event.status !== 'PUBLISHED') throw new ApiError(409, 'INVALID_EVENT_STATE', 'Only drafts and published events can be edited.');
  if (event.status === 'PUBLISHED' && Object.keys(input).some((key) => !['title', 'description', 'venue'].includes(key))) {
    throw new ApiError(409, 'INVALID_EVENT_STATE', 'Published events allow only title, description, and venue edits.');
  }
  const fields = await validateResult(event, input);
  if (event.status === 'DRAFT' && fields.startAt.getTime() <= Date.now()) {
    throw new ApiError(400, 'INVALID_EVENT_INPUT', 'Draft start must be in the future. Reschedule this draft.');
  }
  return conditionalWrite(event, input);
}

export async function publishEvent(organizerId: string, id: string) {
  const event = await ownedEvent(organizerId, id);
  if (event.status !== 'DRAFT') throw new ApiError(409, 'INVALID_EVENT_STATE', 'Only a draft can be published.');
  const fields = await validateResult(event, {}, true);
  if (fields.startAt.getTime() <= Date.now() || fields.registrationDeadline.getTime() <= Date.now()) {
    throw new ApiError(409, 'EVENT_NOT_PUBLISHABLE', 'Start and registration deadline must still be in the future.');
  }
  return conditionalWrite(event, { status: 'PUBLISHED' });
}

export async function cancelEvent(organizerId: string, id: string) {
  return mongoose.connection.transaction(async (session) => {
    const event = await ownedEvent(organizerId, id, session);
    if (event.status !== 'DRAFT' && event.status !== 'PUBLISHED') throw new ApiError(409, 'INVALID_EVENT_STATE', 'Only drafts and published events can be cancelled.');
    if (event.reservedCount !== 0 || await Reservation.exists({
      eventId: event._id, status: { $in: [...ACTIVE_RESERVATION_STATUSES] }
    }).session(session)) {
      throw new ApiError(409, 'EVENT_HAS_ACTIVE_RESERVATIONS', 'Events with active reservations cannot be cancelled.');
    }
    // Future allocation must update this same PUBLISHED event in its reservation transaction.
    // A concurrent allocation then causes a write conflict and fresh safety checks on retry.
    return conditionalWrite(event, { status: 'CANCELLED' }, session);
  }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary', maxCommitTimeMS: 5000 });
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
