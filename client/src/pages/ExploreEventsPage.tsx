import { useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { ArrowLeft, ArrowRight, Search, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PublicEventCard } from '@/components/discovery/EventCard';
import { EventFilters } from '@/components/discovery/EventFilters';
import { DiscoveryEmptyState, DiscoveryError, DiscoverySkeleton } from '@/components/discovery/DiscoveryFeedback';
import { discoveryDefaults, discoveryQueryString, parseDiscoverySearch } from '@/lib/discovery-query';
import { usePublicEvents } from '@/hooks/usePublicEvents';
import { useAvailabilityClock } from '@/hooks/useAvailabilityClock';
import type { DiscoveryQuery } from '@/types/discovery';

export function ExploreEventsPage() {
  const [params, setParams] = useSearchParams(), location = useLocation();
  const { query, recovered } = parseDiscoverySearch(params);
  const [draft, setDraft] = useState({ key: location.key, text: query.q });
  const [filtersOpen, setFiltersOpen] = useState(() => !window.matchMedia?.('(max-width: 760px)').matches);
  const search = draft.key === location.key ? draft.text : query.q;
  const queryKey = discoveryQueryString(query);
  const resource = usePublicEvents(query), now = useAvailabilityClock(resource.data?.events ?? []);
  useEffect(() => {
    if (search.trim() === query.q) return;
    const timer = setTimeout(() => {
      const current = parseDiscoverySearch(new URLSearchParams(queryKey)).query;
      setParams(discoveryQueryString({ ...current, q: search.trim(), page: 1 }), { replace: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, query.q, queryKey, setParams]);
  function change(patch: Partial<DiscoveryQuery>) {
    const pendingSearch = search.trim() !== query.q;
    setParams(discoveryQueryString({ ...query, q: search.trim(), page: 1, ...patch, ...(pendingSearch ? { page: 1 } : {}) }));
  }
  const clear = () => { setDraft({ key: '', text: '' }); setParams(discoveryQueryString(discoveryDefaults)); };
  const filtered = !!(query.venue || query.price !== 'all' || query.from || query.to), data = resource.data;
  return <section className="discovery-page" aria-labelledby="explore-heading">
    <header className="discovery-heading"><div><p className="eyebrow"><span className="eyebrow-line" />THE NEXT GOOD THING</p><h1 id="explore-heading">Explore <span>Events</span></h1><p>Find a new perspective. Meet your people. Make a little room for being there.</p></div><span className="discovery-heading-mark" aria-hidden="true">✳</span></header>
    <form className="discovery-search" role="search" onSubmit={(event) => { event.preventDefault(); change({ q: search.trim() }); }}><Search size={20} aria-hidden="true" /><label className="sr-only" htmlFor="discovery-search">Search events by title or venue</label><input id="discovery-search" type="search" autoComplete="off" maxLength={120} placeholder="A title, a place, a possibility…" value={search} onChange={(event) => setDraft({ key: location.key, text: event.target.value })} />{search && <button type="button" aria-label="Clear search" onClick={() => change({ q: '' })}><X size={17} /></button>}<Button type="submit">Search events</Button></form>
    {recovered && <p className="discovery-query-notice" role="status">Some search parameters were invalid. Safe defaults are shown; apply filters to update this address.</p>}
    <div className="discovery-workspace"><aside className="discovery-filter-panel"><details open={filtersOpen} onToggle={(event) => setFiltersOpen(event.currentTarget.open)}><summary><SlidersHorizontal size={16} />Refine your search<span>Filters</span></summary><EventFilters query={query} apply={change} clear={clear} /></details><p className="discovery-sidebar-note">Good things happen<br /><span>when you show up.</span></p></aside>
      <div className="discovery-results"><div className="discovery-results-toolbar"><p role="status" aria-live="polite">{resource.loading ? 'Finding your next experience…' : data ? `${data.pagination.total} upcoming ${data.pagination.total === 1 ? 'event' : 'events'}${query.q ? ' matching “' + query.q + '”' : ''}` : 'Event discovery'}</p><label>Sort by<select aria-label="Sort events" value={query.sort} onChange={(event) => change({ sort: event.target.value as DiscoveryQuery['sort'] })}><option value="soonest">Soonest upcoming</option><option value="latest">Latest upcoming</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option></select></label></div>
        {resource.loading ? <DiscoverySkeleton /> : resource.error ? <DiscoveryError error={resource.error} retry={resource.reload} /> : data && <>
          {data.events.length ? <div className="discovery-grid">{data.events.map((event) => <PublicEventCard key={event.id} event={event} now={now} search={queryKey} />)}</div> : <DiscoveryEmptyState filtered={filtered} searched={!!query.q} outside={data.pagination.total > 0} clear={data.pagination.total > 0 ? () => change({ page: 1 }) : clear} />}
          {data.pagination.totalPages > 0 && <nav className="discovery-pagination" aria-label="Event pagination"><Button variant="ghost" onClick={() => change({ page: query.page - 1 })} disabled={query.page <= 1}><ArrowLeft size={15} />Previous</Button><span>Page {data.pagination.page} of {data.pagination.totalPages}</span><Button variant="ghost" onClick={() => change({ page: query.page + 1 })} disabled={query.page >= data.pagination.totalPages || query.page >= 10000}>Next<ArrowRight size={15} /></Button></nav>}
        </>}
        <p className="discovery-inventory-note">Availability reflects the latest loaded inventory. Reserve a ten-minute hold, confirm it through simulated checkout, then generate your ticket.</p>
      </div>
    </div>
  </section>;
}
