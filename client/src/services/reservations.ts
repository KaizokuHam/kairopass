import { ApiRequestError, isRecord, request } from './api';
import { reservationStatuses, type AttendeeReservation, type ReservationList, type ReservationSnapshot, type ReservationStatus } from '@/types/reservations';

const root = '/reservations', idPattern = /^[a-f\d]{24}$/i;
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
function invalid(): never { throw new ApiRequestError('The reservation service returned an unexpected response. Check My Reservations before retrying a submitted action.', undefined, 'INVALID_RESPONSE'); }
export function parseReservation(value: unknown): AttendeeReservation {
  if (!isRecord(value) || Object.keys(value).some((key) => !['id', 'eventId', 'status', 'amountPaise', 'expiresAt', 'createdAt', 'updatedAt', 'event'].includes(key)) ||
    !['id', 'eventId'].every((key) => typeof value[key] === 'string' && idPattern.test(value[key])) ||
    !reservationStatuses.includes(value.status as ReservationStatus) ||
    typeof value.amountPaise !== 'number' || !Number.isSafeInteger(value.amountPaise) || value.amountPaise < 0 ||
    !['expiresAt', 'createdAt', 'updatedAt'].every((key) => date(value[key]))) return invalid();
  const event = value.event;
  if (event !== null && (!isRecord(event) || Object.keys(event).some((key) => !['id', 'title', 'venue', 'status', 'startAt', 'endAt', 'registrationDeadline'].includes(key)) ||
    event.id !== value.eventId || typeof event.title !== 'string' || !event.title.trim() || typeof event.venue !== 'string' ||
    !['PUBLISHED', 'DRAFT', 'CANCELLED'].includes(String(event.status)) || !['startAt', 'endAt', 'registrationDeadline'].every((key) => date(event[key])))) return invalid();
  const parsed = value as unknown as AttendeeReservation;
  return { id: parsed.id, eventId: parsed.eventId, status: parsed.status, amountPaise: parsed.amountPaise,
    expiresAt: parsed.expiresAt, createdAt: parsed.createdAt, updatedAt: parsed.updatedAt, event: parsed.event ? { ...parsed.event } : null };
}
function envelope(value: unknown) {
  if (!isRecord(value) || value.success !== true || !isRecord(value.data) || !date(value.data.serverNow)) return invalid();
  return value.data;
}
function single(value: unknown): ReservationSnapshot {
  const data = envelope(value);
  return { reservation: parseReservation(data.reservation), serverNow: data.serverNow as string, receivedAt: Date.now() };
}
function list(value: unknown): ReservationList {
  const data = envelope(value);
  if (!Array.isArray(data.reservations) || !isRecord(data.pagination)) return invalid();
  const p = data.pagination;
  if (!['page', 'limit', 'total', 'totalPages'].every((key) => typeof p[key] === 'number' && Number.isSafeInteger(p[key]) && p[key] >= 0)) return invalid();
  const { page, limit, total, totalPages } = p as unknown as ReservationList['pagination'];
  const reservations = data.reservations.map(parseReservation);
  if (page < 1 || page > 10_000 || limit < 1 || limit > 50 || totalPages !== Math.ceil(total / limit) ||
    reservations.length !== Math.max(0, Math.min(limit, total - (page - 1) * limit)) || new Set(reservations.map((r) => r.id)).size !== reservations.length) return invalid();
  return { reservations, pagination: { page, limit, total, totalPages }, serverNow: data.serverNow as string, receivedAt: Date.now() };
}
function resource(id: string) {
  if (!idPattern.test(id)) throw new ApiRequestError('This reservation could not be found.', 404, 'RESERVATION_NOT_FOUND');
  return root + '/' + id;
}
export const reservationsApi = {
  create: (eventId: string, signal: AbortSignal) => request(root, { method: 'POST', signal, body: { eventId }, parse: single }),
  list: (page: number, status: ReservationStatus | '', signal: AbortSignal) => request(root + '?' + new URLSearchParams({ page: String(page), limit: '10', ...(status ? { status } : {}) }), { signal, parse: list }),
  get: (id: string, signal: AbortSignal) => request(resource(id), { signal, parse: single }),
  cancel: (id: string, signal: AbortSignal) => request(resource(id) + '/cancel', { method: 'POST', signal, parse: single })
};
