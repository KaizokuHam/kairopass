import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from './useAuth';
import { ApiRequestError } from '@/services/api';
import { reservationsApi } from '@/services/reservations';
import type { ReservationStatus } from '@/types/reservations';

export function useAttendeeResource<T>(resourceKey: string, load: (signal: AbortSignal) => Promise<T>) {
  const { user, status, refreshSession } = useAuth();
  const owner = status === 'AUTHENTICATED' && user?.role === 'ATTENDEE' ? user.id : '';
  const [attempt, setAttempt] = useState(0), generation = useRef(0);
  const key = owner + ':' + resourceKey + ':' + attempt;
  const [state, setState] = useState<{ key: string; data: T | null; error: ApiRequestError | null; loading: boolean }>({ key: '', data: null, error: null, loading: true });
  useEffect(() => {
    const controller = new AbortController(), id = ++generation.current;
    void (async () => {
      await Promise.resolve();
      if (!owner || controller.signal.aborted) return;
      setState({ key, data: null, error: null, loading: true });
      try {
        const data = await load(controller.signal);
        if (!controller.signal.aborted && id === generation.current) setState({ key, data, error: null, loading: false });
      } catch (error) {
        if (controller.signal.aborted || id !== generation.current) return;
        const failure = error instanceof ApiRequestError ? error : new ApiRequestError('Could not load reservations. Please retry.');
        if (failure.status === 401 || (failure.status === 403 && failure.code === 'FORBIDDEN')) await refreshSession();
        if (!controller.signal.aborted && id === generation.current) setState({ key, data: null, error: failure, loading: false });
      }
    })();
    return () => controller.abort();
  }, [key, owner, load, refreshSession]);
  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...(state.key === key ? state : { data: null, error: null, loading: true }), reload };
}
export function useReservations(page: number, status: ReservationStatus | '') {
  const load = useCallback((signal: AbortSignal) => reservationsApi.list(page, status, signal), [page, status]);
  return useAttendeeResource(`list:${page}:${status}`, load);
}
export function useReservation(id: string) {
  const load = useCallback((signal: AbortSignal) => reservationsApi.get(id, signal), [id]);
  return useAttendeeResource('detail:' + id, load);
}
export function useReservationMutation() {
  const { user, status, refreshSession } = useAuth();
  const owner = status === 'AUTHENTICATED' && user?.role === 'ATTENDEE' ? user.id : '';
  const [pending, setPending] = useState(false), current = useRef<AbortController | null>(null);
  const alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; current.current?.abort(); }; }, [owner]);
  const run = useCallback(async <T,>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    if (!owner) throw new ApiRequestError('An attendee account is required.', 403, 'FORBIDDEN');
    if (current.current) throw new ApiRequestError('A reservation action is finishing. Please wait.', undefined, 'BUSY');
    const controller = new AbortController(); current.current = controller; setPending(true);
    try {
      const result = await operation(controller.signal);
      if (controller.signal.aborted || !alive.current) throw new ApiRequestError('The request was cancelled.', undefined, 'CANCELLED');
      return result;
    } catch (error) {
      const failure = error instanceof ApiRequestError ? error : new ApiRequestError('The operation could not be confirmed. Check My Reservations before retrying.');
      if (alive.current && !controller.signal.aborted && (failure.status === 401 || (failure.status === 403 && failure.code === 'FORBIDDEN'))) await refreshSession();
      throw failure;
    } finally { if (current.current === controller) { current.current = null; if (alive.current) setPending(false); } }
  }, [owner, refreshSession]);
  return { run, pending };
}
export function uncertainReservation(error: ApiRequestError) {
  return error.status === undefined || error.status >= 500 || error.code === 'INVALID_RESPONSE';
}
