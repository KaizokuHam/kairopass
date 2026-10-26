import { useEffect, useState } from 'react';
import { holdRemaining } from '@/lib/reservation-format';
import type { ReservationSnapshot } from '@/types/reservations';
export function useHoldClock(snapshot: ReservationSnapshot | null) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (snapshot?.reservation.status !== 'HELD') return;
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [snapshot]);
  return snapshot ? holdRemaining(snapshot, now) : 0;
}
