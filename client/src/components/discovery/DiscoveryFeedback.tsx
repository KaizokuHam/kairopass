import { Compass, RefreshCw, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ApiRequestError } from '@/services/api';

export function DiscoverySkeleton({ detail = false }: { detail?: boolean }) {
  return <div role="status" aria-label="Loading events"><span className="sr-only">Loading events…</span><div className={detail ? 'discovery-detail-skeleton' : 'discovery-grid'} aria-hidden="true">{Array.from({ length: detail ? 1 : 6 }, (_, index) => <div className="discovery-skeleton" key={index}><div /><span /><span /><span /></div>)}</div></div>;
}
export function DiscoveryError({ error, retry }: { error: ApiRequestError; retry: () => void }) {
  const missing = error.status === 404;
  return <div className="discovery-message" role="alert"><SearchX size={30} aria-hidden="true" /><h2>{missing ? 'Event not available.' : 'We couldn’t load events.'}</h2><p>{missing ? 'This event may be unpublished, cancelled, or no longer upcoming.' : error.message}</p>{error.requestId && <small>Reference: {error.requestId}</small>}{!missing && <Button variant="ghost" onClick={retry}><RefreshCw size={15} />Retry loading events</Button>}</div>;
}
export function DiscoveryEmptyState({ filtered, searched, outside, clear }: { filtered: boolean; searched: boolean; outside: boolean; clear: () => void }) {
  return <div className="discovery-message"><Compass size={34} aria-hidden="true" /><p className="eyebrow">A LITTLE ROOM FOR POSSIBILITY</p><h2>{outside ? 'You’ve reached the end of this view.' : searched ? 'No events match your search.' : filtered ? 'No events match these filters.' : 'The next good thing is on its way.'}</h2><p>{filtered || searched ? 'Try another title, venue, or date to find your next experience.' : outside ? 'Return to the first page to see upcoming events.' : 'There are no published upcoming events yet. Check back for new experiences from organizers.'}</p>{(filtered || searched || outside) && <Button variant="ghost" onClick={clear}>{outside ? 'Back to first page' : 'Clear filters'}</Button>}</div>;
}
