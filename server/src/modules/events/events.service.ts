import { Event } from '../../models/Event.model.js';
import { ApiError } from '../../lib/api-error.js';
import { completeEventSchema, parseEventInput, type CreateEventInput } from './events.validation.js';
import { toOrganizerEvent } from './events.mapper.js';

export async function createEvent(organizerId: string, input: CreateEventInput) {
  const fields = parseEventInput(input, completeEventSchema);
  if (fields.startAt.getTime() <= Date.now()) throw new ApiError(400, 'INVALID_EVENT_INPUT', 'Event start must be in the future.');
  const event = await Event.create({ ...fields, organizerId, status: 'DRAFT', reservedCount: 0 });
  return toOrganizerEvent(event);
}
