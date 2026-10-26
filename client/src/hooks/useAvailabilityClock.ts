import { useEffect, useState } from 'react';
import type { PublicEvent } from '@/types/discovery';

/** Update exact start/deadline boundaries while a page remains open, and on return to the tab. */
export function useAvailabilityClock(events: readonly PublicEvent[]) {
  const [now, setNow] = useState(Date.now);
  const nextBoundary = Math.min(...events.flatMap((event) => [Date.parse(event.startAt), Date.parse(event.registrationDeadline)]).filter((time) => time > now));
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = setTimeout(refresh, Math.max(1, Math.min(60_000, nextBoundary - Date.now())));
    document.addEventListener('visibilitychange', refresh);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [nextBoundary, now]);
  return now;
}
