import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiRequestError } from '@/services/api';
import { discoveryApi } from '@/services/discovery';
import { discoveryQueryString, parseDiscoverySearch } from '@/lib/discovery-query';
import type { DiscoveryQuery } from '@/types/discovery';

function usePublicResource<T>(resourceKey: string, load: (signal: AbortSignal) => Promise<T>) {
  const [attempt, setAttempt] = useState(0); const generation = useRef(0);
  const key = resourceKey + ':' + attempt;
  const [state, setState] = useState<{ key: string; data: T | null; error: ApiRequestError | null }>({ key: '', data: null, error: null });
  useEffect(() => {
    const controller = new AbortController(), current = ++generation.current;
    async function run() {
      try {
        const data = await load(controller.signal);
        if (!controller.signal.aborted && current === generation.current) setState({ key, data, error: null });
      } catch (error) {
        if (!controller.signal.aborted && current === generation.current) setState({ key, data: null,
          error: error instanceof ApiRequestError ? error : new ApiRequestError('Could not load events. Please retry.') });
      }
    }
    void run(); return () => controller.abort();
  }, [key, load]);
  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  const visible = state.key === key ? state : { data: null, error: null };
  return { ...visible, loading: !visible.data && !visible.error, reload };
}
export function usePublicEvents(query: DiscoveryQuery) {
  const queryKey = discoveryQueryString(query);
  const load = useCallback((signal: AbortSignal) => discoveryApi.list(parseDiscoverySearch(new URLSearchParams(queryKey)).query, signal), [queryKey]);
  return usePublicResource('list:' + queryKey, load);
}
export function usePublicEvent(id: string) {
  const load = useCallback((signal: AbortSignal) => discoveryApi.get(id, signal), [id]);
  return usePublicResource('event:' + id, load);
}
