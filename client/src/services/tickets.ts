import { ApiRequestError, isRecord, request } from './api';
import { admissionStates, ticketStatuses, type TicketDetails, type TicketList, type TicketResult, type TicketStatus, type TicketSummary } from '@/types/tickets';
const idPattern = /^[a-f\d]{24}$/i;
const date = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
function invalid(): never { throw new ApiRequestError('The ticket service returned an unexpected response. Check My Tickets before retrying.', undefined, 'INVALID_RESPONSE'); }
function parseTicket(value: unknown, detail: boolean): TicketSummary | TicketDetails {
  if (!isRecord(value) || Object.keys(value).some((key) => !['id', 'reservationId', 'status', 'createdAt', 'updatedAt', 'checkedInAt', 'amountPaise', 'admissionState', 'qrAvailable', 'event', ...(detail ? ['qrPayload'] : [])].includes(key)) ||
    !['id', 'reservationId'].every((key) => typeof value[key] === 'string' && idPattern.test(value[key])) ||
    !ticketStatuses.includes(value.status as TicketStatus) || !admissionStates.includes(value.admissionState as TicketSummary['admissionState']) ||
    !['createdAt', 'updatedAt'].every((key) => date(value[key])) || (value.checkedInAt !== null && !date(value.checkedInAt)) ||
    typeof value.amountPaise !== 'number' || !Number.isSafeInteger(value.amountPaise) || value.amountPaise < 0 ||
    typeof value.qrAvailable !== 'boolean' || value.qrAvailable !== (value.admissionState === 'AVAILABLE') ||
    (value.qrAvailable && value.status !== 'ISSUED') || (value.status === 'USED' && !value.checkedInAt)) return invalid();
  const event = value.event;
  if (event !== null && (!isRecord(event) || Object.keys(event).some((key) => !['id', 'title', 'venue', 'startAt', 'endAt', 'status'].includes(key)) ||
    typeof event.id !== 'string' || !idPattern.test(event.id) || typeof event.title !== 'string' || !event.title.trim() || typeof event.venue !== 'string' ||
    !['PUBLISHED', 'DRAFT', 'CANCELLED'].includes(String(event.status)) || !date(event.startAt) || !date(event.endAt))) return invalid();
  if (value.qrAvailable && (!event || event.status !== 'PUBLISHED')) return invalid();
  if (detail && (value.qrAvailable ? typeof value.qrPayload !== 'string' || value.qrPayload.length > 512 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(value.qrPayload) : value.qrPayload !== null)) return invalid();
  const parsed = value as unknown as TicketDetails;
  const summary: TicketSummary = { id: parsed.id, reservationId: parsed.reservationId, status: parsed.status, createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt, checkedInAt: parsed.checkedInAt, amountPaise: parsed.amountPaise, admissionState: parsed.admissionState, qrAvailable: parsed.qrAvailable, event: parsed.event ? { ...parsed.event } : null };
  return detail ? { ...summary, qrPayload: parsed.qrPayload } : summary;
}
function envelope(value: unknown) {
  if (!isRecord(value) || value.success !== true || !isRecord(value.data) || !date(value.data.serverNow)) return invalid();
  return value.data;
}
function single(value: unknown): TicketResult { const data = envelope(value); return { ticket: parseTicket(data.ticket, true) as TicketDetails, serverNow: data.serverNow as string }; }
function list(value: unknown): TicketList {
  const data = envelope(value), p = data.pagination;
  if (!Array.isArray(data.tickets) || !isRecord(p) || !['page', 'limit', 'total', 'totalPages'].every((key) => typeof p[key] === 'number' && Number.isSafeInteger(p[key]) && p[key] >= 0)) return invalid();
  const { page, limit, total, totalPages } = p as unknown as TicketList['pagination'];
  const tickets = data.tickets.map((v) => parseTicket(v, false) as TicketSummary);
  if (page < 1 || page > 10000 || limit < 1 || limit > 50 || totalPages !== Math.ceil(total / limit) || tickets.length !== Math.max(0, Math.min(limit, total - (page - 1) * limit)) || new Set(tickets.map((t) => t.id)).size !== tickets.length) return invalid();
  return { tickets, pagination: { page, limit, total, totalPages }, serverNow: data.serverNow as string };
}
function resource(id: string) { if (!idPattern.test(id)) throw new ApiRequestError('This ticket could not be found.', 404, 'TICKET_NOT_FOUND'); return '/' + id; }
export const ticketsApi = {
  list: (page: number, status: TicketStatus | '', signal: AbortSignal, reservationId?: string) => request('/tickets?' + new URLSearchParams({ page: String(page), limit: '10', ...(status ? { status } : {}), ...(reservationId ? { reservationId } : {}) }), { signal, parse: list }),
  get: (id: string, signal: AbortSignal) => request('/tickets' + resource(id), { signal, parse: single }),
  issue: (id: string, signal: AbortSignal) => request('/reservations' + resource(id) + '/ticket', { method: 'POST', body: {}, signal, parse: single })
};
