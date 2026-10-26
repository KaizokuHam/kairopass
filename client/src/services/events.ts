import { ApiRequestError, isRecord, request } from './api';
import type { CreateEventInput, DraftEventUpdate, EventListQuery, OrganizerEvent, OrganizerEventList, PublishedEventUpdate } from '@/types/events';

const root = '/organizer/events';
const idPattern = /^[a-f\d]{24}$/i;
const keys = ['id', 'organizerId', 'title', 'description', 'venue', 'startAt', 'endAt', 'registrationDeadline', 'capacity', 'pricePaise', 'reservedCount', 'status', 'createdAt', 'updatedAt'];
function invalid(): never { throw new ApiRequestError('The event service returned an unexpected response. Please retry.', undefined, 'INVALID_RESPONSE'); }
export function parseOrganizerEvent(value: unknown): OrganizerEvent {
  if (!isRecord(value) || Object.keys(value).some((key) => !keys.includes(key)) ||
    !['id', 'organizerId'].every((key) => typeof value[key] === 'string' && idPattern.test(value[key])) ||
    !['title', 'description', 'venue'].every((key) => typeof value[key] === 'string') ||
    !['startAt', 'endAt', 'registrationDeadline', 'createdAt', 'updatedAt'].every((key) => typeof value[key] === 'string' && Number.isFinite(Date.parse(value[key]))) ||
    !['capacity', 'pricePaise', 'reservedCount'].every((key) => typeof value[key] === 'number' && Number.isSafeInteger(value[key]) && value[key] >= 0) ||
    !['DRAFT', 'PUBLISHED', 'CANCELLED'].includes(String(value.status))) return invalid();
  const event = value as unknown as OrganizerEvent;
  if (event.capacity < 1 || event.reservedCount > event.capacity || !event.title.trim() || !event.venue.trim() ||
    Date.parse(event.endAt) <= Date.parse(event.startAt) || Date.parse(event.registrationDeadline) > Date.parse(event.startAt)) return invalid();
  return { id: event.id, organizerId: event.organizerId, title: event.title, description: event.description,
    venue: event.venue, startAt: event.startAt, endAt: event.endAt, registrationDeadline: event.registrationDeadline,
    capacity: event.capacity, pricePaise: event.pricePaise, reservedCount: event.reservedCount, status: event.status,
    createdAt: event.createdAt, updatedAt: event.updatedAt };
}
function single(value: unknown): OrganizerEvent {
  return isRecord(value) && value.success === true && isRecord(value.data) ? parseOrganizerEvent(value.data.event) : invalid();
}
function list(value: unknown): OrganizerEventList {
  if (!isRecord(value) || value.success !== true || !isRecord(value.data) || !Array.isArray(value.data.events) || !isRecord(value.data.pagination)) return invalid();
  const pagination = value.data.pagination;
  if (!['page', 'limit', 'total', 'totalPages'].every((key) => typeof pagination[key] === 'number' && Number.isSafeInteger(pagination[key]) && pagination[key] >= 0)) return invalid();
  const { page, limit, total, totalPages } = pagination as unknown as OrganizerEventList['pagination'];
  const events = value.data.events.map(parseOrganizerEvent);
  if (page < 1 || page > 10_000 || limit < 1 || limit > 50 || totalPages !== Math.ceil(total / limit) ||
    events.length !== Math.max(0, Math.min(limit, total - (page - 1) * limit)) || new Set(events.map((event) => event.id)).size !== events.length) return invalid();
  return { events, pagination: { page, limit, total, totalPages } };
}
function resource(id: string) {
  if (!idPattern.test(id)) throw new ApiRequestError('This event address is invalid.', 400, 'INVALID_EVENT_ID');
  return root + '/' + id;
}
export function eventQueryString(query: EventListQuery): string {
  const params = new URLSearchParams({ page: String(query.page ?? 1), limit: String(query.limit ?? 10), sort: query.sort ?? 'newest' });
  if (query.status) params.set('status', query.status);
  if (query.search?.trim()) params.set('search', query.search.trim());
  return params.toString();
}
const editable = ['title', 'description', 'venue', 'startAt', 'endAt', 'registrationDeadline', 'capacity', 'pricePaise'] as const;
function updateBody(input: DraftEventUpdate | PublishedEventUpdate) {
  return Object.fromEntries(editable.filter((key) => key in input).map((key) => [key, input[key as keyof typeof input]]));
}
export const eventsApi = {
  createEvent: (input: CreateEventInput, signal: AbortSignal) => request(root, { method: 'POST', signal, body: updateBody(input), parse: single }),
  getOrganizerEvents: (query: EventListQuery, signal: AbortSignal) => request(root + '?' + eventQueryString(query), { signal, parse: list }),
  getOrganizerEvent: (id: string, signal: AbortSignal) => request(resource(id), { signal, parse: single }),
  updateEvent: (id: string, input: DraftEventUpdate | PublishedEventUpdate, signal: AbortSignal) => request(resource(id), { method: 'PATCH', signal, body: updateBody(input), parse: single }),
  publishEvent: (id: string, signal: AbortSignal) => request(resource(id) + '/publish', { method: 'POST', signal, parse: single }),
  cancelEvent: (id: string, signal: AbortSignal) => request(resource(id) + '/cancel', { method: 'POST', signal, parse: single })
};
