export const ticketStatuses = ['ISSUED', 'USED', 'REVOKED'] as const;
export type TicketStatus = typeof ticketStatuses[number];
export const admissionStates = ['AVAILABLE', 'USED', 'REVOKED', 'EVENT_CANCELLED', 'EVENT_UNAVAILABLE', 'RESERVATION_INVALID', 'PAYMENT_UNVERIFIED'] as const;
export interface TicketSummary {
  id: string; reservationId: string; status: TicketStatus; createdAt: string; updatedAt: string; checkedInAt: string | null;
  amountPaise: number; admissionState: typeof admissionStates[number]; qrAvailable: boolean;
  event: { id: string; title: string; venue: string; startAt: string; endAt: string; status: 'PUBLISHED' | 'DRAFT' | 'CANCELLED' } | null;
}
export interface TicketDetails extends TicketSummary { qrPayload: string | null }
export interface TicketResult { ticket: TicketDetails; serverNow: string }
export interface TicketList { tickets: TicketSummary[]; pagination: { page: number; limit: number; total: number; totalPages: number }; serverNow: string }
