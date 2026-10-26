import type { ReservationSnapshot, ReservationStatus } from '@/types/reservations';
export const reservationStatusLabel: Record<ReservationStatus, string> = { HELD: 'Awaiting Payment', CONFIRMED: 'Confirmed', EXPIRED: 'Hold Expired', CANCELLED: 'Cancelled' };
export function holdRemaining(snapshot: ReservationSnapshot, now: number) {
  return Math.max(0, Date.parse(snapshot.reservation.expiresAt) - Date.parse(snapshot.serverNow) - Math.max(0, now - snapshot.receivedAt));
}
