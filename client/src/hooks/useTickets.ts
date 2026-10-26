import { useCallback } from 'react';
import { useAttendeeResource } from './useReservations';
import { ticketsApi } from '@/services/tickets';
import type { TicketStatus } from '@/types/tickets';
export function useTickets(page: number, status: TicketStatus | '', reservationId?: string) {
  const load = useCallback((signal: AbortSignal) => ticketsApi.list(page, status, signal, reservationId), [page, status, reservationId]);
  return useAttendeeResource(`tickets:${page}:${status}:${reservationId ?? ''}`, load);
}
export function useTicket(id: string) {
  const load = useCallback((signal: AbortSignal) => ticketsApi.get(id, signal), [id]);
  return useAttendeeResource('ticket:' + id, load);
}
