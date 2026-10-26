import type { EventRecord } from '../../models/Event.model.js';
import type { OrganizerEvent } from './events.types.js';

export function toOrganizerEvent(event: EventRecord): OrganizerEvent {
  return {
    id: event._id.toHexString(), organizerId: event.organizerId.toHexString(),
    title: event.title, description: event.description, venue: event.venue,
    startAt: event.startAt.toISOString(), endAt: event.endAt.toISOString(),
    registrationDeadline: event.registrationDeadline.toISOString(),
    capacity: event.capacity, pricePaise: event.pricePaise, reservedCount: event.reservedCount,
    status: event.status, createdAt: event.createdAt.toISOString(), updatedAt: event.updatedAt.toISOString()
  };
}
