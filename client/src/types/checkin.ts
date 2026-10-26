export const admissionStates = ['OPEN', 'NOT_OPEN', 'CLOSED', 'CANCELLED', 'UNPUBLISHED'] as const;
export interface CheckInEntry { ticketId: string; eventId: string; status: 'USED'; checkedInAt: string; attendeeName: string; eventTitle: string }
export interface CheckInResult { checkIn: CheckInEntry; serverNow: string }
export interface CheckInHistory {
  event: { id: string; title: string; venue: string; startAt: string; endAt: string; status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED' };
  window: { opensAt: string; closesAt: string; state: typeof admissionStates[number] };
  checkIns: CheckInEntry[]; pagination: { page: number; limit: number; total: number; totalPages: number }; serverNow: string; receivedAt: number;
}
export type VerificationState = { phase: 'IDLE' } | { phase: 'VERIFYING' } | { phase: 'APPROVED'; result: CheckInEntry } |
  { phase: 'REJECTED' | 'UNCERTAIN'; code: string; message: string; checkedInAt?: string };
