import { ApiRequestError, isRecord, request } from './api';
import { discoveryQueryString } from '@/lib/discovery-query';
import type { DiscoveryQuery, PublicEvent, PublicEventList } from '@/types/discovery';

const fields = ['id', 'title', 'description', 'venue', 'startAt', 'endAt', 'registrationDeadline', 'capacity', 'reservedCount', 'pricePaise', 'status', 'createdAt'];
function invalid(): never { throw new ApiRequestError('The event service returned an unexpected response. Please retry.', undefined, 'INVALID_RESPONSE'); }
const iso = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
export function parsePublicEvent(value: unknown): PublicEvent {
  if (!isRecord(value) || Object.keys(value).some((key) => !fields.includes(key)) ||
    typeof value.id !== 'string' || !/^[a-f\d]{24}$/i.test(value.id) || value.status !== 'PUBLISHED' ||
    !['title', 'description', 'venue'].every((key) => typeof value[key] === 'string') ||
    !['startAt', 'endAt', 'registrationDeadline', 'createdAt'].every((key) => iso(value[key])) ||
    !['capacity', 'reservedCount', 'pricePaise'].every((key) => typeof value[key] === 'number' && Number.isSafeInteger(value[key]) && value[key] >= 0)) return invalid();
  const event = value as unknown as PublicEvent;
  if (!event.title.trim() || event.title.length > 120 || !event.venue.trim() || event.venue.length > 200 || event.description.length > 10000 ||
    event.capacity < 1 || event.reservedCount > event.capacity || Date.parse(event.endAt) <= Date.parse(event.startAt) ||
    Date.parse(event.registrationDeadline) > Date.parse(event.startAt)) return invalid();
  return { id: event.id, title: event.title, description: event.description, venue: event.venue, startAt: event.startAt,
    endAt: event.endAt, registrationDeadline: event.registrationDeadline, capacity: event.capacity,
    reservedCount: event.reservedCount, pricePaise: event.pricePaise, status: 'PUBLISHED', createdAt: event.createdAt };
}
function single(value: unknown) {
  return isRecord(value) && value.success === true && isRecord(value.data) ? parsePublicEvent(value.data.event) : invalid();
}
function list(value: unknown): PublicEventList {
  if (!isRecord(value) || value.success !== true || !isRecord(value.data) || !Array.isArray(value.data.events) || !isRecord(value.data.pagination)) return invalid();
  const metadata = value.data.pagination;
  if (!['page', 'limit', 'total', 'totalPages'].every((key) => typeof metadata[key] === 'number' && Number.isSafeInteger(metadata[key]) && metadata[key] >= 0)) return invalid();
  const { page, limit, total, totalPages } = metadata as unknown as PublicEventList['pagination'];
  const events = value.data.events.map(parsePublicEvent);
  if (page < 1 || page > 10000 || limit < 1 || limit > 50 || totalPages !== Math.ceil(total / limit) ||
    events.length !== Math.max(0, Math.min(limit, total - (page - 1) * limit)) || new Set(events.map((event) => event.id)).size !== events.length) return invalid();
  return { events, pagination: { page, limit, total, totalPages } };
}
export const discoveryApi = {
  list: (query: DiscoveryQuery, signal: AbortSignal) => request('/events?' + discoveryQueryString(query), { signal, parse: list }),
  get: (id: string, signal: AbortSignal) => {
    if (!/^[a-f\d]{24}$/i.test(id)) return Promise.reject(new ApiRequestError('This event could not be found.', 404, 'EVENT_NOT_FOUND'));
    return request('/events/' + id, { signal, parse: single });
  }
};
