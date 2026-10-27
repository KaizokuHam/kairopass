import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, BarChart3, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnalyticsChart } from '@/components/analytics/AnalyticsChart';
import { AnalyticsKpis } from '@/components/analytics/AnalyticsKpis';
import { EventPerformanceTable } from '@/components/analytics/EventPerformanceTable';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useAuth } from '@/hooks/useAuth';
import { formatEventDate, localTimezone, localDateTimeToIso, toLocalDateTime } from '@/lib/event-format';
import type { AnalyticsPeriod, AnalyticsQuery, AnalyticsSort } from '@/types/analytics';
export function OrganizerAnalyticsPage() {
  const { id } = useParams(), { user } = useAuth();
  return <AnalyticsWorkspace key={(user?.id ?? '') + ':' + (id ?? '')} eventId={id} />;
}
function AnalyticsWorkspace({ eventId }: { eventId: string | undefined }) {
  const [params, setParams] = useSearchParams();
  const period = ['7d', '30d', '90d', 'all'].includes(params.get('period') ?? '') ? params.get('period') as AnalyticsPeriod : '30d';
  const sort = ['date_asc', 'date_desc', 'bookings', 'revenue', 'checkins'].includes(params.get('sort') ?? '') ? params.get('sort') as AnalyticsSort : 'date_desc';
  const page = /^[1-9]\d{0,4}$/.test(params.get('page') ?? '') && Number(params.get('page')) <= 10000 ? Number(params.get('page')) : 1;
  const query: AnalyticsQuery = { page, sort, ...(params.has('from') || params.has('to') ? { from: params.get('from') ?? '', to: params.get('to') ?? '' } : { period }), ...(!eventId && params.get('eventId') ? { eventId: params.get('eventId')! } : {}) };
  const resource = useAnalytics(query, eventId), data = resource.data;
  const [custom, setCustom] = useState(false), [from, setFrom] = useState(() => params.get('from') && Number.isFinite(Date.parse(params.get('from')!)) ? toLocalDateTime(params.get('from')!) : '');
  const [to, setTo] = useState(() => params.get('to') && Number.isFinite(Date.parse(params.get('to')!)) ? toLocalDateTime(params.get('to')!) : ''), [error, setError] = useState('');
  function change(fields: Record<string, string | null>) {
    const next = new URLSearchParams(params); next.delete('page');
    for (const [key, value] of Object.entries(fields)) { if (value === null) next.delete(key); else next.set(key, value); }
    setParams(next);
  }
  const title = eventId ? data?.events[0]?.title ?? 'Event report' : 'Your events, in perspective';
  return <div className="analytics-page">{eventId && <Link className="text-link event-back" to={'/organizer/events/' + eventId}><ArrowLeft size={16} />Event details</Link>}
    <header className="analytics-heading"><div><p className="eyebrow">THE NUMBERS BEHIND BEING THERE</p><h1>{eventId ? 'Event analytics' : 'Analytics'}<span>.</span></h1><p>{title}</p></div><Button variant="ghost" disabled={resource.loading} onClick={resource.reload}><RefreshCw size={16} />Refresh analytics</Button></header>
    <p className="analytics-disclosure"><BarChart3 size={18} /><span>All financial values are simulated. No real money has changed hands.</span></p>
    <section className="analytics-filters" aria-label="Analytics reporting filters"><label>Reporting period<select value={custom || query.from !== undefined ? 'custom' : period} onChange={(e) => { setError(''); if (e.target.value === 'custom') setCustom(true); else { setCustom(false); change({ period: e.target.value, from: null, to: null }); } }}><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option><option value="all">All time</option><option value="custom">Custom range</option></select></label>
      <label>Sort event performance<select value={sort} onChange={(e) => change({ sort: e.target.value })}><option value="date_desc">Event date · latest first</option><option value="date_asc">Event date · earliest first</option><option value="bookings">Confirmed bookings · highest first</option><option value="revenue">Simulated Gross Revenue · highest first</option><option value="checkins">Check-ins · highest first</option></select></label>
      {!eventId && <label>Filter to owned event<select value={query.eventId ?? ''} onChange={(e) => change({ eventId: e.target.value || null })}><option value="">All owned events</option>{data?.events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}{query.eventId && !data?.events.some((e) => e.id === query.eventId) && <option value={query.eventId}>Selected event</option>}</select><small>Choose from this table page, or open an event report.</small></label>}
      {(custom || query.from !== undefined) && <form className="analytics-custom" onSubmit={(e) => { e.preventDefault(); const start = localDateTimeToIso(from), end = localDateTimeToIso(to); if (!start || !end || Date.parse(end) <= Date.parse(start) || Date.parse(end) - Date.parse(start) > 366 * 86400000) { setError('Choose a valid start and a later end, no more than 366 days apart.'); return; } setError(''); change({ period: null, from: start, to: end }); }}><label>From · {localTimezone()}<input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} required aria-describedby={error ? 'analytics-range-error' : undefined} /></label><label>To · exclusive · {localTimezone()}<input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} required aria-describedby={error ? 'analytics-range-error' : undefined} /></label><Button type="submit">Apply date range</Button>{error && <p id="analytics-range-error" role="alert">{error}</p>}</form>}
    </section>
    {resource.loading && <section className="analytics-feedback" role="status"><h2>Loading your analytics…</h2><p>Reading persisted bookings, simulated payments and admissions.</p></section>}
    {resource.error && <section className="analytics-feedback" role="alert"><h2>{resource.error.status === 404 ? 'Event analytics not found.' : 'Analytics unavailable.'}</h2><p>{resource.error.message}</p><Button onClick={resource.reload}>Retry analytics</Button></section>}
    {data && <><p className="analytics-scope">Selected activity: {formatEventDate(data.scope.from)} → {formatEventDate(data.scope.to)} (end exclusive) · Display: {localTimezone()} · Charts: UTC, {data.scope.bucketDays}-day buckets.<br />Current metrics are lifetime snapshots. Last read {formatEventDate(data.scope.generatedAt)}.</p>
      {!data.metrics.current.totalEvents && <section className="analytics-feedback"><h2>No events to report yet.</h2><p>Create your first event to begin building a real booking and attendance history.</p><Link className="button button-primary" to="/organizer/events/new">Create Event</Link></section>}
      <AnalyticsKpis metrics={data.metrics} />
      <div className="analytics-charts">{(['reservations', 'money', 'attendance'] as const).map((kind) => <AnalyticsChart key={kind + data.scope.from + data.scope.to} kind={kind} points={data.trends} />)}</div>
      <section className="analytics-facts" aria-label="Facts from this report"><p><strong>{data.metrics.period.failedSimulatedPaymentAttempts}</strong> failed simulated attempts were created in the selected period. They contribute no simulated revenue.</p><p><strong>{data.metrics.current.ticketsUsed} of {data.metrics.current.confirmedBookings}</strong> confirmed bookings have a persisted check-in. Attendance uses lifetime totals.</p></section>
      {data.events.length > 0 && <EventPerformanceTable report={data} page={(value) => change({ page: String(value) })} />}
      {data.metrics.current.totalEvents > 0 && !data.events.length && <section className="analytics-feedback"><h2>No events on this page.</h2><Button onClick={() => change({ page: '1' })}>Return to first page</Button></section>}
    </>}
  </div>;
}
