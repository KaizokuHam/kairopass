import type { TicketDetails, TicketSummary } from '@/types/tickets';
import { json } from './fixtures';
import { held, serverNow } from './reservations-fixtures';
// Ephemeral fixture token; frontend encodes these exact server-provided bytes without signing.
export const qrPayload = 'eyJ2IjoxLCJ0aWNrZXRJZCI6IjkwN2YxZjc3YmNmODZjZDc5OTQzOTAxMSIsIm5vbmNlIjoiYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYSJ9.' + 'a'.repeat(43);
export const ticket: TicketDetails = { id: '907f1f77bcf86cd799439011', reservationId: held.id, status: 'ISSUED', createdAt: serverNow, updatedAt: serverNow,
  checkedInAt: null, amountPaise: held.amountPaise, admissionState: 'AVAILABLE', qrAvailable: true, qrPayload,
  event: { id: held.eventId, title: held.event!.title, venue: held.event!.venue, startAt: held.event!.startAt, endAt: held.event!.endAt, status: 'PUBLISHED' } };
export const summary = (t: TicketDetails = ticket): TicketSummary => ({ id: t.id, reservationId: t.reservationId, status: t.status, createdAt: t.createdAt, updatedAt: t.updatedAt, checkedInAt: t.checkedInAt, amountPaise: t.amountPaise, admissionState: t.admissionState, qrAvailable: t.qrAvailable, event: t.event });
export const ticketResponse = (t = ticket, status = 200) => json({ success: true, data: { ticket: t, serverNow } }, status);
export const ticketList = (tickets: TicketSummary[] = [], pagination = {}) => json({ success: true, data: { tickets, serverNow, pagination: { page: 1, limit: 10, total: tickets.length, totalPages: tickets.length ? 1 : 0, ...pagination } } });
