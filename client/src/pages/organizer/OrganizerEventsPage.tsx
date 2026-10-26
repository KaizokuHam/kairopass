import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { ArrowLeft, ArrowRight, CalendarPlus, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOrganizerEvents } from '@/hooks/useOrganizerEvents';
import { EventCard } from '@/components/events/EventCard';
import { EventError, EventLoading } from '@/components/events/EventFeedback';
import type { EventStatus } from '@/types/events';
export function OrganizerEventsPage() {
  const [params, setParams] = useSearchParams(); const location = useLocation();
  const number = (name: string, fallback: number, max: number) => {
    const text = params.get(name) ?? ''; const value = Number(text);
    return /^[1-9]\d*$/.test(text) && value <= max ? value : fallback;
  };
  const page = number('page', 1, 10000), limit = number('limit', 10, 50);
  const status = ['DRAFT', 'PUBLISHED', 'CANCELLED'].includes(params.get('status') ?? '') ? params.get('status') as EventStatus : undefined;
  const sort = params.get('sort') === 'oldest' ? 'oldest' : 'newest';
  const search = (params.get('search') ?? '').slice(0, 120);
  const [draft, setDraft] = useState({ key: location.key, value: search });
  const searchText = draft.key === location.key ? draft.value : search;
  const resource = useOrganizerEvents({ page, limit, sort, ...(status ? { status } : {}), ...(search ? { search } : {}) });
  useEffect(() => {
    if (searchText === search) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams({ page: '1', limit: String(limit), sort });
      if (status) next.set('status', status); if (searchText.trim()) next.set('search', searchText.trim());
      setParams(next, { replace: true });
    }, 350);
    return () => clearTimeout(timer);
  }, [searchText, search, limit, sort, status, setParams]);
  function change(name: string, value: string) {
    const next = new URLSearchParams({ page: '1', limit: String(limit), sort });
    if (status) next.set('status', status); if (searchText.trim()) next.set('search', searchText.trim());
    if (name === 'page' && searchText.trim() !== search.trim()) next.set('page', '1');
    else if (value) next.set(name, value); else next.delete(name);
    setParams(next);
  }
  const data = resource.data;
  return <><header className="events-heading events-heading-row"><div><p className="eyebrow">YOUR EXPERIENCES, TOGETHER</p><h1>My Events.</h1><p>From the first idea to the final detail. Make it happen here.</p></div>
    <Link className="button button-primary" to="/organizer/events/new"><Plus size={16} />Create Event</Link></header>
    <div className="event-filters"><div className="event-search"><label htmlFor="event-search">Search by title</label><div><Search size={16} /><input id="event-search" type="search" maxLength={120} value={searchText} onChange={(action) => setDraft({ key: location.key, value: action.target.value })} placeholder="Find an event…" /></div></div>
      <div><label htmlFor="event-status">Status</label><select id="event-status" value={status ?? ''} onChange={(action) => change('status', action.target.value)}><option value="">All events</option><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option><option value="CANCELLED">Cancelled</option></select></div>
      <div><label htmlFor="event-sort">Sort</label><select id="event-sort" value={sort} onChange={(action) => change('sort', action.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></div>
      <div><label htmlFor="event-limit">Per page</label><select id="event-limit" value={limit} onChange={(action) => change('limit', action.target.value)}>{[...new Set([5, 10, 25, 50, limit])].sort((a, b) => a - b).map((value) => <option value={value} key={value}>{value}</option>)}</select></div>
    </div>
    {resource.loading ? <EventLoading /> : resource.error ? <EventError error={resource.error} retry={resource.reload} /> : data && <>
      {data.events.length ? <><p className="event-result-count" role="status">{data.pagination.total.toLocaleString('en-IN')} {data.pagination.total === 1 ? 'event' : 'events'} in this view · times in your local timezone</p><div className="event-card-grid">{data.events.map((event) => <EventCard event={event} key={event.id} />)}</div></>
        : <div className="event-empty"><CalendarPlus size={32} strokeWidth={1.4} /><h2>{page > 1 && data.pagination.total ? 'This page is empty.' : status || search ? 'No events match this view.' : 'Your first event starts here.'}</h2>
          <p>{status || search ? 'Try another title or clear the filters to see your events.' : 'Bring your next idea to life. Save a draft and shape the details at your own pace.'}</p>
          {page > 1 ? <Button onClick={() => change('page', '1')}>Go to first page</Button> : status || search ? <Button variant="ghost" onClick={() => setParams({})}>Clear filters</Button> : <Link className="button button-primary" to="/organizer/events/new"><Plus size={15} />Create your first event</Link>}</div>}
      <nav className="event-pagination" aria-label="Event pagination"><span>Page {data.pagination.page} of {Math.max(1, data.pagination.totalPages)}</span><div>
        <Button variant="ghost" disabled={page <= 1} onClick={() => change('page', String(page - 1))}><ArrowLeft size={14} />Previous</Button>
        <Button variant="ghost" disabled={page >= Math.min(data.pagination.totalPages, 10000)} onClick={() => change('page', String(page + 1))}>Next<ArrowRight size={14} /></Button>
      </div></nav>
    </>}
  </>;
}
