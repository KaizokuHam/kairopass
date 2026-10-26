import { json } from './fixtures';
import type { PublicEvent, PublicEventList } from '@/types/discovery';

export const publicEvent: PublicEvent = {
  id: '607f1f77bcf86cd799439011', title: 'Cloud Engineering Workshop', description: 'Learn together, in person.',
  venue: 'SST Bengaluru', startAt: '2040-02-10T10:00:00.000Z', endAt: '2040-02-10T13:00:00.000Z',
  registrationDeadline: '2040-02-09T18:00:00.000Z', capacity: 100, pricePaise: 19900, reservedCount: 3,
  status: 'PUBLISHED', createdAt: '2026-10-26T04:00:00.000Z'
};
export const publicDetail = (event: PublicEvent = publicEvent) => json({ success: true, data: { event } });
export const publicList = (events: PublicEvent[] = [publicEvent], metadata: Partial<PublicEventList['pagination']> = {}) => json({ success: true, data: {
  events, pagination: { page: 1, limit: 12, total: events.length, totalPages: events.length ? 1 : 0, ...metadata }
} });
