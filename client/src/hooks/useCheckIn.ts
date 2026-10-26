import { useCallback, useEffect, useRef, useState } from 'react';
import { useOrganizerResource } from './useOrganizerEvents';
import { useEventMutation } from './useEventMutation';
import { ApiRequestError } from '@/services/api';
import { checkInApi, credentialShape } from '@/services/checkin';
import type { CheckInHistory, VerificationState } from '@/types/checkin';
export function useCheckInHistory(eventId: string, page: number) {
  const load = useCallback((signal: AbortSignal) => checkInApi.history(eventId, page, signal), [eventId, page]);
  return useOrganizerResource(`admissions:${eventId}:${page}`, load);
}
export function useAdmissionClock(snapshot: CheckInHistory | null) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = setInterval(refresh, 1000); document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  return snapshot ? Date.parse(snapshot.serverNow) + Math.max(0, now - snapshot.receivedAt) : 0;
}
export function useCheckInSubmission(eventId: string, changed: () => void) {
  const { run } = useEventMutation(), busy = useRef(false), alive = useRef(false), credential = useRef('');
  const [state, setState] = useState<VerificationState>({ phase: 'IDLE' });
  useEffect(() => { alive.current = true; return () => { alive.current = false; credential.current = ''; }; }, []);
  const submit = useCallback(async (input: string) => {
    if (busy.current || !alive.current) return;
    if (!credentialShape(input)) { credential.current = ''; setState({ phase: 'REJECTED', code: 'INVALID_QR_PAYLOAD', message: 'Provide the complete signed QR credential. A ticket reference alone cannot approve admission.' }); return; }
    busy.current = true; credential.current = input; setState({ phase: 'VERIFYING' });
    try {
      const result = await run((signal) => checkInApi.admit(eventId, input, signal));
      if (alive.current) { credential.current = ''; setState({ phase: 'APPROVED', result: result.checkIn }); changed(); }
    } catch (error) {
      if (!alive.current || (error instanceof ApiRequestError && ['CANCELLED', 'BUSY'].includes(error.code))) return;
      const failure = error instanceof ApiRequestError ? error : new ApiRequestError('Admission could not be confirmed.');
      const uncertain = failure.status === undefined || failure.status >= 500 || failure.code === 'INVALID_RESPONSE';
      if (!uncertain) credential.current = '';
      setState({ phase: uncertain ? 'UNCERTAIN' : 'REJECTED', code: failure.code, message: failure.message, ...(failure.checkedInAt ? { checkedInAt: failure.checkedInAt } : {}) });
      changed();
    } finally { busy.current = false; }
  }, [eventId, run, changed]);
  const reset = useCallback(() => { if (!busy.current) { credential.current = ''; setState({ phase: 'IDLE' }); } }, []);
  const retry = useCallback(() => { if (credential.current) void submit(credential.current); }, [submit]);
  return { state, submit, reset, retry };
}
