import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from './useAuth';
import { ApiRequestError } from '@/services/api';
import { eventQueryString, eventsApi } from '@/services/events';
import type { EventListQuery } from '@/types/events';

export function useOrganizerResource<T>(resourceKey: string, load: (signal: AbortSignal, owner: string) => Promise<T>) {
  const { user, status, refreshSession } = useAuth();
  const owner = status === 'AUTHENTICATED' && user?.role === 'ORGANIZER' ? user.id : '';
  const [attempt, setAttempt] = useState(0);
  const key = owner + ':' + resourceKey + ':' + attempt;
  const [state, setState] = useState<{ key: string; data: T | null; error: ApiRequestError | null; loading: boolean }>({ key: '', data: null, error: null, loading: true });
  const generation = useRef(0);
  useEffect(() => {
    const controller = new AbortController(); const id = ++generation.current;
    async function run() {
      await Promise.resolve();
      if (controller.signal.aborted || !owner) return;
      setState({ key, data: null, error: null, loading: true });
      try {
        const data = await load(controller.signal, owner);
        if (!controller.signal.aborted && id === generation.current) setState({ key, data, error: null, loading: false });
      } catch (error) {
        if (controller.signal.aborted || id !== generation.current) return;
        const failure = error instanceof ApiRequestError ? error : new ApiRequestError('Could not load events. Please retry.');
        if (failure.status === 401 || (failure.status === 403 && failure.code === 'FORBIDDEN')) await refreshSession();
        if (!controller.signal.aborted && id === generation.current) setState({ key, data: null, error: failure, loading: false });
      }
    }
    void run();
    return () => controller.abort();
  }, [key, load, owner, refreshSession]);
  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...(state.key === key ? state : { data: null, error: null, loading: true }), reload };
}
function requireOwner(owner: string, organizerId: string) {
  if (owner !== organizerId) throw new ApiRequestError('The event service returned an unexpected response. Please retry.', undefined, 'INVALID_RESPONSE');
}
export function useOrganizerEvents(query: EventListQuery) {
  const queryKey = eventQueryString(query);
  const load = useCallback(async (signal: AbortSignal, owner: string) => {
    const params = new URLSearchParams(queryKey);
    const result = await eventsApi.getOrganizerEvents({
      page: Number(params.get('page')), limit: Number(params.get('limit')), sort: params.get('sort') === 'oldest' ? 'oldest' : 'newest',
      ...(params.get('status') ? { status: params.get('status') as NonNullable<EventListQuery['status']> } : {}),
      ...(params.get('search') ? { search: params.get('search')! } : {})
    }, signal);
    result.events.forEach((event) => requireOwner(owner, event.organizerId));
    return result;
  }, [queryKey]);
  return useOrganizerResource('list:' + queryKey, load);
}
export function useOrganizerEvent(id: string) {
  const load = useCallback(async (signal: AbortSignal, owner: string) => {
    const event = await eventsApi.getOrganizerEvent(id, signal); requireOwner(owner, event.organizerId); return event;
  }, [id]);
  return useOrganizerResource('event:' + id, load);
}
