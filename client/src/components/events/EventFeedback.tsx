import { Link } from 'react-router';
import { AlertCircle, LoaderCircle, RefreshCw } from 'lucide-react';
import type { ApiRequestError } from '@/services/api';
import { Button } from '@/components/ui/button';

export function EventLoading({ message = 'Loading your events…' }: { message?: string }) {
  return <div className="event-loading" role="status"><LoaderCircle size={20} className="spin" /><span>{message}</span><div className="event-skeleton" aria-hidden="true" /></div>;
}
export function EventError({ error, retry, compact = false, mutation = false }: { error: ApiRequestError; retry?: () => void; compact?: boolean; mutation?: boolean }) {
  const missing = error.status === 404 || error.code === 'INVALID_EVENT_ID';
  return <div className={'event-error ' + (compact ? 'compact' : '')} role="alert"><AlertCircle size={21} /><div>
    <h2>{missing ? 'Event not found.' : error.status === 403 ? 'This action is not available.' : 'Let’s try that again.'}</h2>
    <p>{error.message}</p>{error.requestId && <small>Reference: {error.requestId}</small>}
    {mutation && error.status === undefined && <p>The change may already have reached the server. Check your events before repeating it.</p>}
    <div className="event-inline-actions">{retry && <Button variant="ghost" onClick={retry}><RefreshCw size={14} />{error.status === 409 ? 'Reload latest event' : 'Retry connection'}</Button>}<Link className="text-link" to="/organizer/events">Back to My Events</Link></div>
  </div></div>;
}
