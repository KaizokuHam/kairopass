import type { CheckInEntry, CheckInHistory } from '@/types/checkin';
import { json } from './fixtures';
import { sampleEvent } from './events-fixtures';
import { ticket, qrPayload } from './tickets-fixtures';
export { qrPayload };
export const admissionNow = '2040-02-10T09:00:00.000Z';
export const checkInEvent = { ...sampleEvent, status: 'PUBLISHED' as const };
export const admissionEvent: CheckInHistory['event'] = { id: sampleEvent.id, title: sampleEvent.title, venue: sampleEvent.venue, startAt: sampleEvent.startAt, endAt: sampleEvent.endAt, status: 'PUBLISHED' };
export const admitted: CheckInEntry = { ticketId: ticket.id, eventId: sampleEvent.id, status: 'USED', checkedInAt: admissionNow, attendeeName: 'Actual Attendee', eventTitle: sampleEvent.title };
export const checkInResponse = (entry = admitted) => json({ success: true, data: { checkIn: entry, serverNow: admissionNow } });
export function historyResponse(entries: CheckInEntry[] = [], overrides: Partial<Omit<CheckInHistory, 'receivedAt'>> = {}) {
  return json({ success: true, data: { event: admissionEvent,
    window: { opensAt: '2040-02-10T08:00:00.000Z', closesAt: sampleEvent.endAt, state: 'OPEN' }, checkIns: entries,
    pagination: { page: 1, limit: 10, total: entries.length, totalPages: entries.length ? 1 : 0 }, serverNow: admissionNow, ...overrides } });
}
export const alreadyUsed = () => json({ success: false, error: { code: 'TICKET_ALREADY_USED', message: 'do not display raw details', details: [{ field: 'checkedInAt', message: admitted.checkedInAt }] } }, 409);
