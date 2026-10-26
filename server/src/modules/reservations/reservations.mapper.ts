import type { EventRecord } from '../../models/Event.model.js';
import type { ReservationRecord } from '../../models/Reservation.model.js';

export type ReservationEvent = Pick<EventRecord, '_id' | 'title' | 'venue' | 'startAt' | 'endAt' | 'registrationDeadline' | 'status'>;
export const reservationEventProjection = '_id title venue startAt endAt registrationDeadline status';
export function toAttendeeReservation(reservation: ReservationRecord, event: ReservationEvent | null) {
  return {
    id: reservation._id.toString(), eventId: reservation.eventId.toString(), status: reservation.status,
    amountPaise: reservation.amountPaise, expiresAt: reservation.expiresAt.toISOString(),
    createdAt: reservation.createdAt.toISOString(), updatedAt: reservation.updatedAt.toISOString(),
    event: event ? {
      id: event._id.toString(), title: event.title, venue: event.venue, status: event.status,
      startAt: event.startAt.toISOString(), endAt: event.endAt.toISOString(),
      registrationDeadline: event.registrationDeadline.toISOString()
    } : null
  };
}
export type AttendeeReservation = ReturnType<typeof toAttendeeReservation>;
