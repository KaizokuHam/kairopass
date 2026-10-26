import type { OrganizerEvent, EventPagination } from '@/types/events';
import { json, organizer } from './fixtures';

export const sampleEvent: OrganizerEvent = {
  id: '607f1f77bcf86cd799439011', organizerId: organizer.id, title: 'Cloud Engineering Workshop', description: 'Learn together, in person.',
  venue: 'SST Bengaluru', startAt: '2040-02-10T10:00:00.000Z', endAt: '2040-02-10T13:00:00.000Z',
  registrationDeadline: '2040-02-09T18:00:00.000Z', capacity: 100, pricePaise: 19900, reservedCount: 3, status: 'DRAFT',
  createdAt: '2026-10-26T04:00:00.000Z', updatedAt: '2026-10-26T04:00:00.000Z'
};
export const eventResponse = (event: OrganizerEvent = sampleEvent, status = 200) => json({ success: true, data: { event } }, status);
export const eventsResponse = (events: OrganizerEvent[] = [sampleEvent], metadata: Partial<EventPagination> = {}) => json({ success: true, data: {
  events, pagination: { page: 1, limit: 10, total: events.length, totalPages: events.length ? 1 : 0, ...metadata }
} });
