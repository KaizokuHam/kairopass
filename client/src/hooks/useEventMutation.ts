import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from './useAuth';
import { ApiRequestError } from '@/services/api';

export function useEventMutation() {
  const { user, status, refreshSession } = useAuth();
  const owner = status === 'AUTHENTICATED' && user?.role === 'ORGANIZER' ? user.id : '';
  const [pending, setPending] = useState(false);
  const current = useRef<AbortController | null>(null);
  const alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; current.current?.abort(); }; }, [owner]);
  const run = useCallback(async <T,>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    if (!owner) throw new ApiRequestError('Organizer access is required.', 403, 'FORBIDDEN');
    if (current.current) throw new ApiRequestError('An event action is already finishing. Please wait.', undefined, 'BUSY');
    const controller = new AbortController(); current.current = controller; setPending(true);
    try {
      const result = await operation(controller.signal);
      if (controller.signal.aborted || !alive.current) throw new ApiRequestError('The request was cancelled.', undefined, 'CANCELLED');
      return result;
    } catch (error) {
      const failure = error instanceof ApiRequestError ? error : new ApiRequestError('The event change could not be confirmed. Reload before retrying.');
      if (alive.current && !controller.signal.aborted && (failure.status === 401 || (failure.status === 403 && failure.code === 'FORBIDDEN'))) await refreshSession();
      throw failure;
    } finally { if (current.current === controller) { current.current = null; if (alive.current) setPending(false); } }
  }, [owner, refreshSession]);
  return { run, pending };
}
