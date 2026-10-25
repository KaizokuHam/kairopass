import { Check, LoaderCircle, RefreshCw, WifiOff } from 'lucide-react';
import { useApiHealth } from '@/hooks/useApiHealth';
import { Button } from '@/components/ui/button';

export function ApiStatus() {
  const { state, refresh } = useApiHealth();
  return (
    <div className={`api-status api-${state.status}`}>
      <div role="status" aria-live="polite" aria-atomic="true" className="status-copy">
        {state.status === 'loading' && <><LoaderCircle size={14} className="spin" /><span>Checking API connection…</span></>}
        {state.status === 'connected' && <><span className="status-dot" /><span>API connected</span><Check size={13} /></>}
        {state.status === 'error' && <><WifiOff size={14} /><span>API unavailable</span></>}
      </div>
      <Button variant="ghost" className="status-refresh" onClick={refresh} disabled={state.status === 'loading'}
        aria-label={state.status === 'error' ? 'Retry API connection' : 'Check API connection again'}>
        <RefreshCw size={13} /><span>{state.status === 'error' ? 'Retry' : 'Recheck'}</span>
      </Button>
      {state.status === 'error' && <p className="status-error">{state.message}</p>}
    </div>
  );
}
