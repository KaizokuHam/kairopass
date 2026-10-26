import type { EventPagination, EventStatus } from './events';
export const reservationStatuses = ['HELD', 'CONFIRMED', 'EXPIRED', 'CANCELLED'] as const;
export type ReservationStatus = typeof reservationStatuses[number];
export interface AttendeeReservation {
  id: string; eventId: string; status: ReservationStatus; amountPaise: number;
  expiresAt: string; createdAt: string; updatedAt: string;
  event: { id: string; title: string; venue: string; status: EventStatus; startAt: string; endAt: string; registrationDeadline: string } | null;
}
export interface ReservationSnapshot { reservation: AttendeeReservation; serverNow: string; receivedAt: number }
export interface ReservationList { reservations: AttendeeReservation[]; pagination: EventPagination; serverNow: string; receivedAt: number }
