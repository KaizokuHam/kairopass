import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
// Compile the real lazy module before assertion timers start. These tests measure
// provider/HTTP behavior; cold browser chunk loading is exercised separately.
import '@/pages/organizer/OrganizerAnalyticsPage';
import { AuthProvider } from '@/context/AuthProvider';
import { useAuth } from '@/hooks/useAuth';
import { formatPrice } from '@/lib/event-format';
import { safeAuthDestination } from '@/lib/auth-navigation';
import { parseAnalytics } from '@/services/analytics';
import { attendee, deferred, failure, json, organizer, userResponse } from './fixtures';
import { sampleEvent, eventResponse } from './events-fixtures';
import { analyticsFixture, analyticsResponse, emptyReport } from './analytics-fixtures';
const base = '/api/organizer/analytics/overview', route = '/organizer/analytics', eventRoute = '/organizer/events/' + sampleEvent.id + '/analytics';
function Probe() {
  const { refreshSession } = useAuth(), navigate = useNavigate();
  return <><button onClick={() => { void refreshSession(); }}>Revalidate identity</button><button onClick={() => { void navigate(route); }}>Open report</button></>;
}
function show(path = route) { return render(<MemoryRouter useTransitions={false} initialEntries={[path]}><AuthProvider><App /><Probe /></AuthProvider></MemoryRouter>); }
function boundary(options: { report?: (path: string, init: RequestInit) => Response | Promise<Response>; me?: () => Response } = {}) {
  const fetcher = vi.fn(async (path: string, init: RequestInit) => {
    if (path === '/api/auth/me') return options.me?.() ?? userResponse(organizer);
    if (path === '/api/health') return json({ success: true, message: 'KairoPass API is running' });
    if (path === '/api/auth/logout') return json({ success: true, message: 'Logged out successfully.' });
    if (path.startsWith(base + '?') || path.includes('/analytics?')) return options.report?.(path, init) ?? analyticsResponse();
    if (path === '/api/organizer/events/' + sampleEvent.id) return eventResponse();
    if (path.startsWith('/api/organizer/events?')) return json({ success: true, data: { events: [], pagination: { page: 1, limit: 3, total: 0, totalPages: 0 } } });
    throw new Error('Unexpected analytics test HTTP route');
  }); vi.stubGlobal('fetch', fetcher); return fetcher;
}
const reports = (fetcher: ReturnType<typeof boundary>) => fetcher.mock.calls.filter(([path]) => path.includes('/analytics/overview?') || path.includes('/analytics?'));
async function ready() { await screen.findByRole('region', { name: 'Simulated Gross Revenue' }); }
const card = (name: string) => within(screen.getByRole('region', { name }));
function single(report = analyticsFixture()) { report.events = [report.events[0]!]; report.pagination = { page: 1, limit: 10, total: 1, totalPages: 1 }; report.metrics.current.totalEvents = 1; return report; }

describe('real analytics provider/router and HTTP boundary', () => {
  it('renders API-backed KPIs with explicit scopes, simulated disclosure and exact formatting', async () => {
    const fetcher = boundary(); show(); await ready();
    expect(card('Confirmed Bookings').getByText('4')).toBeVisible(); expect(card('Active Holds').getByText('1')).toBeVisible();
    expect(card('Simulated Gross Revenue').getByText('₹1,497.00')).toBeVisible(); expect(card('Check-Ins').getByText('1')).toBeVisible();
    expect(card('Attendance Rate').getByText('25%')).toBeVisible(); expect(card('Reservation-to-Confirmation Conversion').getByText('42.86%')).toBeVisible();
    expect(screen.getByText(/No real money has changed hands/)).toBeVisible(); expect(screen.getByText(/Current metrics are lifetime snapshots/)).toBeVisible();
    expect(reports(fetcher)).toHaveLength(1); expect(reports(fetcher)[0]![1].method).toBe('GET'); expect(screen.queryByText(/Coming in Task 12/)).not.toBeInTheDocument();
  });
  it('keeps loading distinct from zero or empty success', async () => {
    const pending = deferred<Response>(); boundary({ report: () => pending.promise }); show(); await screen.findByText('Loading your analytics…');
    expect(screen.queryByRole('region', { name: 'Confirmed Bookings' })).not.toBeInTheDocument();
    pending.resolve(analyticsResponse()); await ready();
  });
  it('shows genuine empty metrics, N/A denominators and empty charts without fabricated curves', async () => {
    boundary({ report: () => analyticsResponse(emptyReport()) }); show(); await ready();
    expect(screen.getByText('No events to report yet.')).toBeVisible(); expect(card('Attendance Rate').getByText('N/A')).toBeVisible();
    expect(card('Reservation-to-Confirmation Conversion').getByText('N/A')).toBeVisible(); expect(card('Simulated Gross Revenue').getByText('₹0.00')).toBeVisible();
    expect(screen.getByText('No reservations created in this period.')).toBeVisible(); expect(screen.getByText('No simulated revenue in this period.')).toBeVisible(); expect(screen.queryByRole('img', { name: /full values/ })).not.toBeInTheDocument();
  });
  it.each(['network', '503', 'malformed'])('unavailable %s reports never masquerade as zero metrics', async (kind) => {
    boundary({ report: () => { if (kind === 'network') throw new TypeError('transport'); return kind === '503' ? json({ success: false, error: { code: 'ANALYTICS_UNAVAILABLE', message: 'private internal detail' } }, 503) : json({ success: true, data: {} }); } });
    show(); await screen.findByText('Analytics unavailable.'); expect(screen.getByRole('button', { name: 'Retry analytics' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Confirmed Bookings' })).not.toBeInTheDocument(); expect(screen.queryByText(/private internal detail/)).not.toBeInTheDocument(); expect(screen.queryByText('No events to report yet.')).not.toBeInTheDocument();
  });
  it('recovers an error and refreshes from actual responses', async () => {
    let failed = true; const fetcher = boundary({ report: () => failed ? failure(503, 'ANALYTICS_UNAVAILABLE') : analyticsResponse() }); show();
    await screen.findByText('Analytics unavailable.'); failed = false; await userEvent.click(screen.getByRole('button', { name: 'Retry analytics' })); await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Refresh analytics' })); await ready(); expect(reports(fetcher)).toHaveLength(3);
  });
  it.each(['7d', '90d', 'all'])('changing the period to %s requests fresh server data', async (period) => {
    const fetcher = boundary(); show(); await ready(); await userEvent.selectOptions(screen.getByLabelText('Reporting period'), period); await ready();
    expect(reports(fetcher).at(-1)![0]).toContain('period=' + period); expect(reports(fetcher)).toHaveLength(2);
  });
  it('applies a custom local-time range as explicit UTC instants and resets pagination', async () => {
    const fetcher = boundary(); show(route + '?page=2'); await ready();
    await userEvent.selectOptions(screen.getByLabelText('Reporting period'), 'custom');
    fireEvent.change(screen.getByLabelText(/^From ·/), { target: { value: '2040-02-08T00:00' } }); fireEvent.change(screen.getByLabelText(/^To ·/), { target: { value: '2040-02-10T00:00' } });
    await userEvent.click(screen.getByRole('button', { name: 'Apply date range' })); await ready();
    const url = new URL(reports(fetcher).at(-1)![0], 'http://localhost'); expect(url.searchParams.get('from')).toBe(new Date(2040, 1, 8).toISOString()); expect(url.searchParams.get('to')).toBe(new Date(2040, 1, 10).toISOString()); expect(url.searchParams.get('page')).toBe('1'); expect(url.searchParams.has('period')).toBe(false);
  });
  it('rejects reversed custom dates without making a new report request', async () => {
    const fetcher = boundary(); show(); await ready(); await userEvent.selectOptions(screen.getByLabelText('Reporting period'), 'custom');
    fireEvent.change(screen.getByLabelText(/^From ·/), { target: { value: '2040-02-10T00:00' } }); fireEvent.change(screen.getByLabelText(/^To ·/), { target: { value: '2040-02-08T00:00' } }); await userEvent.click(screen.getByRole('button', { name: 'Apply date range' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a valid start and a later end'); expect(reports(fetcher)).toHaveLength(1);
  });
  it('unmount aborts the pending private report request', async () => {
    const pending = deferred<Response>(), fetcher = boundary({ report: () => pending.promise }), view = show();
    await waitFor(() => expect(reports(fetcher)).toHaveLength(1)); view.unmount(); expect(reports(fetcher)[0]![1].signal?.aborted).toBe(true); pending.resolve(analyticsResponse());
  });
  it('aborts superseded reports and prevents a late response overwriting a newer filter result', async () => {
    const old = deferred<Response>(), fresh = emptyReport();
    const fetcher = boundary({ report: (path) => path.includes('period=7d') ? analyticsResponse(fresh) : old.promise }); show();
    await waitFor(() => expect(reports(fetcher)).toHaveLength(1)); await userEvent.selectOptions(screen.getByLabelText('Reporting period'), '7d'); await ready();
    expect(reports(fetcher)[0]![1].signal?.aborted).toBe(true); await act(async () => { old.resolve(analyticsResponse()); await Promise.resolve(); });
    expect(screen.getByText('No events to report yet.')).toBeVisible(); expect(card('Confirmed Bookings').getByText('0')).toBeVisible();
  });
  it('charts use returned reservations, simulated revenue and admission points with accessible data tables', async () => {
    boundary(); show(); await ready();
    for (const name of ['Reservation activity', 'Simulated Gross Revenue trend', 'Check-in activity']) expect(screen.getByRole('img', { name: name + '; full values in the chart data table' })).toBeVisible();
    await userEvent.click(screen.getByText('View simulated gross revenue trend data'));
    const table = screen.getByRole('table', { name: 'Simulated Gross Revenue trend · UTC intervals, end exclusive' });
    expect(within(table).getByText('₹499.00')).toBeVisible(); expect(within(table).getByText('₹998.00')).toBeVisible(); expect(within(table).getByText('₹0.00')).toBeVisible();
    const chart = screen.getByRole('region', { name: 'Reservation activity' }); fireEvent.change(within(chart).getByLabelText('Explore UTC bucket'), { target: { value: '1' } });
    expect(within(chart).getByRole('status')).toHaveTextContent('Reservations created: 4 · Currently confirmed: 2');
  });
  it('chart buckets can be explored from keyboard-accessible controls', async () => {
    boundary(); show(); await ready(); const slider = within(screen.getByRole('region', { name: 'Check-in activity' })).getByLabelText('Explore UTC bucket');
    slider.focus(); expect(slider).toHaveFocus(); fireEvent.change(slider, { target: { value: '2' } }); expect(slider).toHaveAttribute('aria-describedby');
    expect(within(screen.getByRole('region', { name: 'Check-in activity' })).getByRole('status')).toHaveTextContent('Check-ins: 1');
  });
  it('event performance displays actual records and sort requests stay on the server', async () => {
    const fetcher = boundary(); show(); await ready(); expect(screen.getByRole('link', { name: 'Paid performance' })).toHaveAttribute('href', eventRoute);
    const paid = screen.getByRole('link', { name: 'Paid performance' }).closest('tr')!; expect(within(paid).getByText('₹1,497.00')).toBeVisible(); expect(within(paid).getByText('33.33%')).toBeVisible();
    await userEvent.selectOptions(screen.getByLabelText('Sort event performance'), 'revenue'); await ready(); expect(reports(fetcher).at(-1)![0]).toContain('sort=revenue');
    expect(screen.getByRole('region', { name: 'Scrollable event performance table' })).toHaveAttribute('tabindex', '0');
  });
  it('event filters submit only the selected event ID', async () => {
    const fetcher = boundary({ report: (path) => analyticsResponse(path.includes('eventId=') ? single() : analyticsFixture()) }); show(); await ready();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /^Filter to owned event/ }), sampleEvent.id); await ready(); expect(reports(fetcher).at(-1)![0]).toContain('eventId=' + sampleEvent.id); expect(screen.getByText('1 owned events')).toBeVisible();
  });
  it('paginates event performance through bounded API requests', async () => {
    const fetcher = boundary({ report: (path) => { const report = analyticsFixture(); report.metrics.current.totalEvents = 12; const row = report.events[0]!;
      const all = Array.from({ length: 12 }, (_, i) => ({ ...row, id: '607f1f77bcf86cd79943' + String(i).padStart(4, '0'), title: 'Actual event ' + (i + 1) }));
      const page = Number(new URL(path, 'http://localhost').searchParams.get('page')); report.events = all.slice((page - 1) * 10, page * 10); report.pagination = { page, limit: 10, total: 12, totalPages: 2 }; return analyticsResponse(report); } });
    show(); await ready(); expect(screen.getByRole('button', { name: 'Previous events' })).toBeDisabled(); await userEvent.click(screen.getByRole('button', { name: 'Next events' })); await ready();
    expect(reports(fetcher).at(-1)![0]).toContain('page=2'); expect(screen.getByRole('link', { name: 'Actual event 11' })).toBeVisible(); expect(screen.getByRole('button', { name: 'Next events' })).toBeDisabled();
  });
  it('event drill-down uses the actual private event analytics endpoint', async () => {
    const fetcher = boundary({ report: (path) => analyticsResponse(path.includes('/events/') ? single() : analyticsFixture()) }); show(); await ready();
    await userEvent.click(screen.getByRole('link', { name: 'Paid performance' })); await screen.findByRole('heading', { name: 'Event analytics.' }); await ready();
    expect(reports(fetcher).at(-1)![0]).toContain('/events/' + sampleEvent.id + '/analytics?');
  });
  it('missing/unowned event reports offer safe retry without stale metrics', async () => {
    boundary({ report: () => failure(404, 'EVENT_NOT_FOUND') }); show(eventRoute); await screen.findByText('Event analytics not found.'); expect(screen.queryByRole('region', { name: 'Confirmed Bookings' })).not.toBeInTheDocument();
  });
  it('unauthenticated visitors reach sign-in without an analytics request', async () => {
    const fetcher = boundary({ me: () => failure(401, 'UNAUTHENTICATED') }); show(); await screen.findByRole('heading', { name: 'Welcome back.' }); expect(reports(fetcher)).toHaveLength(0);
  });
  it('attendees cannot load organizer analytics', async () => {
    const fetcher = boundary({ me: () => userResponse(attendee) }); show(); await screen.findByRole('heading', { name: /This space belongs to another role/ }); expect(reports(fetcher)).toHaveLength(0);
  });
  it('logout removes private report data and protected access', async () => {
    boundary(); show(); await ready(); await userEvent.click(screen.getByRole('button', { name: 'Sign out' })); await screen.findByRole('heading', { name: /Your next/ }); expect(screen.queryByText('₹1,497.00')).not.toBeInTheDocument();
  });
  it('a session outage hides all private analytics without pretending logout', async () => {
    let available = true; boundary({ me: () => available ? userResponse(organizer) : failure(503, 'DATABASE_UNAVAILABLE') }); show(); await ready(); available = false;
    await userEvent.click(screen.getByRole('button', { name: 'Revalidate identity' })); await screen.findByRole('heading', { name: 'Let’s reconnect.' }); expect(screen.queryByRole('region', { name: 'Confirmed Bookings' })).not.toBeInTheDocument(); expect(screen.queryByRole('heading', { name: 'Welcome back.' })).not.toBeInTheDocument();
  });
  it('identity changes clear old report values before the new request resolves', async () => {
    let second = false; const delayed = deferred<Response>(); boundary({ me: () => userResponse(second ? { ...organizer, id: '607f1f77bcf86cd799439099', name: 'Second organizer' } : organizer), report: () => second ? delayed.promise : analyticsResponse() });
    show(); await ready(); second = true; await userEvent.click(screen.getByRole('button', { name: 'Revalidate identity' })); await screen.findByText('Loading your analytics…'); expect(screen.queryByText('₹1,497.00')).not.toBeInTheDocument(); delayed.resolve(analyticsResponse(emptyReport())); await ready();
  });
  it('integrity warnings explain excluded data without displaying credentials or arbitrary diagnostics', async () => {
    const report = analyticsFixture(); report.metrics.integrity = { invalidSuccessReservations: 1, invalidTicketRecords: 2 }; boundary({ report: () => analyticsResponse(report) }); show(); await ready(); expect(screen.getByText('Some persisted records need review.')).toBeVisible(); expect(screen.getByText(/excluded from simulated revenue/)).toBeVisible();
  });
  it('currency formatting retains exact paise above safe-number totals', () => { expect(formatPrice('18014398509531882')).toBe('₹18,01,43,98,50,95,318.82'); });
  it.each(['rates', 'money', 'series', 'event'])('malformed %s responses are rejected, never displayed as business data', (kind) => {
    const report = analyticsFixture();
    if (kind === 'rates') report.metrics.current.attendanceRate = 100;
    if (kind === 'money') report.metrics.period.simulatedGrossRevenuePaise = '1.5';
    if (kind === 'series') report.trends[0]!.checkIns = 999;
    if (kind === 'event') report.events[0]!.id = 'wrong';
    expect(() => parseAnalytics({ success: true, data: report })).toThrow();
  });
  it('analytics return destinations remain role-scoped', () => {
    expect(safeAuthDestination('ORGANIZER', route + '?period=7d')).toBe(route + '?period=7d'); expect(safeAuthDestination('ORGANIZER', eventRoute)).toBe(eventRoute); expect(safeAuthDestination('ATTENDEE', route)).toBe('/attendee/dashboard');
  });
});
