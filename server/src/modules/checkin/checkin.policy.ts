import type { EventRecord } from '../../models/Event.model.js';
import { ApiError } from '../../lib/api-error.js';

export const CHECKIN_EARLY_MS = 2 * 60 * 60 * 1000;
export const checkInStates = ['OPEN', 'NOT_OPEN', 'CLOSED', 'CANCELLED', 'UNPUBLISHED'] as const;
export function admissionWindow(event: Pick<EventRecord, 'startAt' | 'endAt' | 'status'>, now = new Date(Date.now())) {
  const start = event.startAt?.getTime(), end = event.endAt?.getTime();
  const opens = new Date(start - CHECKIN_EARLY_MS);
  if (![start, end, opens.getTime(), now.getTime()].every(Number.isFinite) || end <= start) {
    throw new ApiError(503, 'CHECKIN_STATE_UNAVAILABLE', 'The admission schedule could not be verified.');
  }
  const state = event.status === 'CANCELLED' ? 'CANCELLED' : event.status !== 'PUBLISHED' ? 'UNPUBLISHED' :
    now.getTime() < opens.getTime() ? 'NOT_OPEN' : now.getTime() >= end ? 'CLOSED' : 'OPEN';
  return { opensAt: opens.toISOString(), closesAt: event.endAt.toISOString(), state };
}
export function requireOpenAdmission(event: Pick<EventRecord, 'startAt' | 'endAt' | 'status'>, now = new Date(Date.now())) {
  const window = admissionWindow(event, now);
  if (window.state === 'NOT_OPEN') throw new ApiError(409, 'CHECKIN_NOT_OPEN', 'Check-in opens two hours before the event starts.');
  if (window.state === 'CLOSED') throw new ApiError(409, 'CHECKIN_CLOSED', 'Check-in closed when the event ended.');
  if (window.state === 'CANCELLED') throw new ApiError(409, 'EVENT_CANCELLED', 'This event is cancelled. Admission is unavailable.');
  if (window.state !== 'OPEN') throw new ApiError(409, 'EVENT_NOT_PUBLISHED', 'Only a published event can admit attendees.');
  return window;
}
