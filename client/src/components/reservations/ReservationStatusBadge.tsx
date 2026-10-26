import type { ReservationStatus } from '@/types/reservations';
import { reservationStatusLabel } from '@/lib/reservation-format';
export function ReservationStatusBadge({ status }: { status: ReservationStatus }) {
  return <span className={'reservation-status is-' + status.toLowerCase()}>{reservationStatusLabel[status]}</span>;
}
