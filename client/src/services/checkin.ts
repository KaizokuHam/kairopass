import { ApiRequestError, isRecord, request } from './api';
import { admissionStates, type CheckInEntry, type CheckInHistory, type CheckInResult } from '@/types/checkin';
const id = /^[a-f\d]{24}$/i;
const date = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
function invalid(): never { throw new ApiRequestError('Admission could not be verified. Check history before retrying.', undefined, 'INVALID_RESPONSE'); }
function entry(value: unknown, eventId: string): CheckInEntry {
  if (!isRecord(value) || Object.keys(value).some((key) => !['ticketId', 'eventId', 'status', 'checkedInAt', 'attendeeName', 'eventTitle'].includes(key)) ||
    typeof value.ticketId !== 'string' || !id.test(value.ticketId) || value.eventId !== eventId || value.status !== 'USED' || !date(value.checkedInAt) ||
    typeof value.attendeeName !== 'string' || !value.attendeeName.trim() || typeof value.eventTitle !== 'string' || !value.eventTitle.trim()) return invalid();
  return { ticketId: value.ticketId, eventId, status: 'USED', checkedInAt: value.checkedInAt as string, attendeeName: value.attendeeName, eventTitle: value.eventTitle };
}
function envelope(value: unknown) {
  if (!isRecord(value) || value.success !== true || !isRecord(value.data) || !date(value.data.serverNow)) return invalid();
  return value.data;
}
function single(value: unknown, eventId: string): CheckInResult { const data = envelope(value); return { checkIn: entry(data.checkIn, eventId), serverNow: data.serverNow as string }; }
function history(value: unknown, eventId: string): CheckInHistory {
  const data = envelope(value), event = data.event, window = data.window, p = data.pagination;
  if (!isRecord(event) || Object.keys(event).some((key) => !['id', 'title', 'venue', 'startAt', 'endAt', 'status'].includes(key)) || event.id !== eventId ||
    typeof event.title !== 'string' || !event.title.trim() || typeof event.venue !== 'string' || !date(event.startAt) || !date(event.endAt) || Date.parse(event.endAt as string) <= Date.parse(event.startAt as string) ||
    !['DRAFT', 'PUBLISHED', 'CANCELLED'].includes(String(event.status)) || !isRecord(window) || !date(window.opensAt) || !date(window.closesAt) ||
    !admissionStates.includes(window.state as CheckInHistory['window']['state']) || Date.parse(window.opensAt as string) !== Date.parse(event.startAt as string) - 7200000 || window.closesAt !== event.endAt ||
    !Array.isArray(data.checkIns) || !isRecord(p) || !['page', 'limit', 'total', 'totalPages'].every((key) => typeof p[key] === 'number' && Number.isSafeInteger(p[key]) && p[key] >= 0)) return invalid();
  const { page, limit, total, totalPages } = p as unknown as CheckInHistory['pagination'];
  const serverNow = Date.parse(data.serverNow as string);
  const expected = event.status === 'CANCELLED' ? 'CANCELLED' : event.status !== 'PUBLISHED' ? 'UNPUBLISHED' : serverNow < Date.parse(window.opensAt as string) ? 'NOT_OPEN' : serverNow >= Date.parse(window.closesAt as string) ? 'CLOSED' : 'OPEN';
  if (window.state !== expected) return invalid();
  const checkIns = data.checkIns.map((v) => entry(v, eventId));
  if (page < 1 || page > 10000 || limit < 1 || limit > 50 || totalPages !== Math.ceil(total / limit) || checkIns.length !== Math.max(0, Math.min(limit, total - (page - 1) * limit)) || new Set(checkIns.map((v) => v.ticketId)).size !== checkIns.length) return invalid();
  return { event: { id: eventId, title: event.title, venue: event.venue, startAt: event.startAt as string, endAt: event.endAt as string, status: event.status as CheckInHistory['event']['status'] },
    window: { opensAt: window.opensAt as string, closesAt: window.closesAt as string, state: window.state as CheckInHistory['window']['state'] }, checkIns,
    pagination: { page, limit, total, totalPages }, serverNow: data.serverNow as string, receivedAt: Date.now() };
}
function resource(eventId: string) { if (!id.test(eventId)) throw new ApiRequestError('This event could not be found.', 404, 'EVENT_NOT_FOUND'); return '/organizer/events/' + eventId + '/check-ins'; }
export const checkInApi = {
  admit: (eventId: string, qrPayload: string, signal: AbortSignal) => request(resource(eventId), { method: 'POST', signal, body: { qrPayload }, parse: (value) => single(value, eventId) }),
  history: (eventId: string, page: number, signal: AbortSignal) => request(resource(eventId) + '?' + new URLSearchParams({ page: String(page), limit: '10' }), { signal, parse: (value) => history(value, eventId) })
};
export function credentialShape(input: string) { return input.length <= 512 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(input); }
