import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { PaymentRecoveryContext } from './PaymentRecoveryContext';
import type { LogicalPayment } from '@/types/payments';

/** Memory only. Uncertain keys survive route changes; logout/account changes discard them. */
export function PaymentRecoveryProvider({ children }: { children: ReactNode }) {
  const { user, status } = useAuth();
  const owner = user?.role === 'ATTENDEE' ? user.id : '', verified = status === 'AUTHENTICATED';
  const [stored, setStored] = useState<{ owner: string; attempts: Record<string, LogicalPayment> }>({ owner: '', attempts: {} });
  const active = useRef({ owner, verified });
  useLayoutEffect(() => { active.current = { owner, verified }; }, [owner, verified]);
  useEffect(() => {
    let alive = true;
    queueMicrotask(() => { if (alive) setStored((previous) => previous.owner === owner ? previous : { owner, attempts: {} }); });
    return () => { alive = false; };
  }, [owner]);
  const remember = useCallback((reservationId: string, attempt: LogicalPayment) => {
    if (!owner || !active.current.verified || active.current.owner !== owner) return;
    setStored((previous) => ({ owner, attempts: { ...(previous.owner === owner ? previous.attempts : {}), [reservationId]: attempt } }));
  }, [owner]);
  const attempts = verified && owner && stored.owner === owner ? stored.attempts : {};
  return <PaymentRecoveryContext value={{ attempts, remember }}>{children}</PaymentRecoveryContext>;
}
