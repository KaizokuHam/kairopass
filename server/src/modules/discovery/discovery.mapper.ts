import type { PublicEvent, PublicEventRecord } from './discovery.types.js';

// Apply at the database boundary as well as constructing an explicit response DTO.
export const publicEventProjection = {
  _id: 1, title: 1, description: 1, venue: 1, startAt: 1, endAt: 1,
  registrationDeadline: 1, capacity: 1, reservedCount: 1, pricePaise: 1, createdAt: 1
} as const;

export function toPublicEvent(event: PublicEventRecord): PublicEvent {
  return {
    id: event._id.toHexString(), title: event.title, description: event.description, venue: event.venue,
    startAt: event.startAt.toISOString(), endAt: event.endAt.toISOString(),
    registrationDeadline: event.registrationDeadline.toISOString(), capacity: event.capacity,
    reservedCount: event.reservedCount, pricePaise: event.pricePaise, status: 'PUBLISHED',
    createdAt: event.createdAt.toISOString()
  };
}
