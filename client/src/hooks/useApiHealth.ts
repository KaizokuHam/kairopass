import { useCallback, useEffect, useState } from 'react';
import { api, ApiRequestError } from '@/services/api';
import type { HealthState } from '@/types/api';

export function useApiHealth() {
  const [state, setState] = useState<HealthState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api.health(controller.signal).then((health) => {
      if (!controller.signal.aborted) setState({ status: 'connected', message: health.message });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setState({
        status: 'error',
        message: error instanceof ApiRequestError ? error.message : 'Connection unavailable. Please try again.'
      });
    });
    return () => controller.abort();
  }, [attempt]);

  const refresh = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((value) => value + 1);
  }, []);

  return { state, refresh };
}
