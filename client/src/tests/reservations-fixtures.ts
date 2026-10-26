import type { AttendeeReservation } from '@/types/reservations';
import { json } from './fixtures';
import { publicEvent } from './discovery-fixtures';
export const serverNow = '2040-01-01T00:00:00.000Z';
export const held: AttendeeReservation = {
  id: '707f1f77bcf86cd799439011', eventId: publicEvent.id, status: 'HELD', amountPaise: 19900,
  createdAt: serverNow, updatedAt: serverNow, expiresAt: '2040-01-01T00:10:00.000Z',
  event: { id: publicEvent.id, title: publicEvent.title, venue: publicEvent.venue, status: 'PUBLISHED', startAt: publicEvent.startAt, endAt: publicEvent.endAt, registrationDeadline: publicEvent.registrationDeadline }
};
export const reservationResponse = (reservation = held, now = serverNow, status = 200) => json({ success: true, data: { reservation, serverNow: now, created: status === 201 } }, status);
export const reservationList = (reservations: AttendeeReservation[] = [held], metadata = {}) => json({ success: true, data: {
  reservations, serverNow, pagination: { page: 1, limit: 10, total: reservations.length, totalPages: reservations.length ? 1 : 0, ...metadata }
} });
