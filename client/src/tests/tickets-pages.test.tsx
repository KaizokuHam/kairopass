import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import jsQR from 'jsqr';
import { App } from '@/App';
import { AuthProvider } from '@/context/AuthProvider';
import { useAuth } from '@/hooks/useAuth';
import * as qr from '@/lib/ticket-qr';
import { safeAuthDestination } from '@/lib/auth-navigation';
import { TicketQr } from '@/components/tickets/TicketQr';
import type { TicketDetails } from '@/types/tickets';
import { attendee, deferred, failure, json, organizer, userResponse } from './fixtures';
import { held, reservationResponse, serverNow } from './reservations-fixtures';
import { confirmed, paymentHistory, successPayment } from './payments-fixtures';
import { qrPayload, summary, ticket, ticketList, ticketResponse } from './tickets-fixtures';
const detailPath = '/attendee/tickets/' + ticket.id, issuePath = '/api/reservations/' + held.id + '/ticket';
function Probe() {
  const navigate = useNavigate(), auth = useAuth();
  return <><button onClick={() => { void navigate('/attendee/tickets/907f1f77bcf86cd799439012'); }}>Other ticket</button><button onClick={() => { void auth.refreshSession(); }}>Revalidate identity</button></>;
}
function show(path = '/attendee/tickets') { return render(<MemoryRouter useTransitions={false} initialEntries={[path]}><AuthProvider><App /><Probe /></AuthProvider></MemoryRouter>); }
function boundary(options: {
  list?: (path: string) => Response | Promise<Response>; detail?: (path: string) => Response | Promise<Response>;
  issue?: () => Response | Promise<Response>; me?: () => Response;
} = {}) {
  let issued = false;
  const fetcher = vi.fn(async (path: string, init: RequestInit) => {
    if (path === '/api/auth/me') return options.me?.() ?? userResponse();
    if (path === '/api/auth/logout') return json({ success: true, message: 'Logged out successfully.' });
    if (path === '/api/health') return json({ success: true, message: 'KairoPass API is running' });
    if (path.startsWith('/api/tickets?')) return options.list?.(path) ?? ticketList(issued ? [summary()] : []);
    if (path.startsWith('/api/tickets/')) return options.detail?.(path) ?? ticketResponse();
    if (path === issuePath && init.method === 'POST') { issued = true; return options.issue?.() ?? ticketResponse(ticket, 201); }
    if (path === '/api/reservations/' + held.id) return reservationResponse(confirmed);
    if (path.startsWith('/api/reservations/' + held.id + '/payments?')) return paymentHistory([successPayment], {}, confirmed);
    throw new Error('Unexpected test HTTP path');
  });
  vi.stubGlobal('fetch', fetcher); return fetcher;
}
afterEach(() => { vi.restoreAllMocks(); });
describe('owned ticket wallet and details', () => {
  it('loads, shows a real empty state and never issues on GET', async () => {
    const waiting = deferred<Response>(), fetcher = boundary({ list: () => waiting.promise }); show();
    expect(await screen.findByText('Loading tickets…')).toBeInTheDocument();
    await act(async () => waiting.resolve(ticketList()));
    expect(await screen.findByRole('heading', { name: 'Your next experience belongs here.' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'My Reservations' }).every((l) => l.getAttribute('href') === '/attendee/reservations')).toBe(true);
    expect(fetcher.mock.calls.every(([, init]) => init.method !== 'POST')).toBe(true);
  });
  it('renders actual metadata, filters and bounded pagination with no QR on wallet cards', async () => {
    const fetcher = boundary({ list: (path) => path.includes('page=2') ? ticketList([summary({ ...ticket, id: '907f1f77bcf86cd799439012' })], { page: 2, total: 11, totalPages: 2 }) : ticketList([summary(), ...Array.from({ length: 9 }, (_, i) => summary({ ...ticket, id: '907f1f77bcf86cd7994390' + String(i + 20) }))], { total: 11, totalPages: 2 }) }); show();
    await screen.findByText('Page 1 · 11 tickets'); expect(screen.queryByRole('img', { name: /QR code/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next' })); await screen.findByText('Page 2 · 11 tickets');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'USED');
    await waitFor(() => expect(fetcher.mock.calls.some(([path]) => path.includes('page=1') && path.includes('status=USED'))).toBe(true));
  });
  it('shows a safe retryable 503 error, preserving the authenticated account', async () => {
    let down = true; boundary({ list: () => down ? failure(503, 'TICKET_CONFIGURATION_UNAVAILABLE') : ticketList([summary()]) }); show();
    expect(await screen.findByRole('alert')).toHaveTextContent('Your confirmed reservation is preserved');
    expect(screen.queryByRole('heading', { name: /Welcome back/ })).not.toBeInTheDocument(); down = false;
    await userEvent.click(screen.getByRole('button', { name: 'Retry loading tickets' })); await screen.findByRole('link', { name: 'View Ticket' });
  });
  it('shows attendee, event, venue, reference, active QR and download from owned detail', async () => {
    const fetcher = boundary(); show(detailPath);
    await screen.findByRole('img', { name: 'Your secure ticket QR code' });
    expect(screen.getByText(attendee.name, { selector: 'dd' })).toBeInTheDocument(); expect(screen.getByRole('heading', { name: ticket.event!.title })).toBeInTheDocument();
    expect(screen.getByText(ticket.event!.venue)).toBeInTheDocument(); expect(screen.getByText(ticket.id)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download Ticket PNG' })).toBeEnabled();
    expect(fetcher.mock.calls.find(([path]) => path === '/api/tickets/' + ticket.id)?.[1]).toMatchObject({ credentials: 'same-origin', cache: 'no-store', method: 'GET' });
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
  });
  it.each(['USED', 'REVOKED', 'EVENT_CANCELLED', 'EVENT_UNAVAILABLE', 'PAYMENT_UNVERIFIED', 'RESERVATION_INVALID'] as const)('retains %s history with no QR or active export', async (state) => {
    const t: TicketDetails = { ...ticket, status: state === 'USED' || state === 'REVOKED' ? state : 'ISSUED', checkedInAt: state === 'USED' ? serverNow : null, admissionState: state, qrAvailable: false, qrPayload: null };
    boundary({ detail: () => ticketResponse(t) }); show(detailPath); await screen.findByRole('heading', { name: 'No active QR' });
    expect(screen.queryByRole('img', { name: /QR code/ })).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Download Ticket PNG' })).not.toBeInTheDocument();
    if (state === 'USED') expect(screen.getByText('CHECKED IN')).toBeInTheDocument();
  });
  it.each([404, 503])('shows safe %s detail failures', async (status) => {
    boundary({ detail: () => failure(status) }); show(detailPath); await screen.findByRole('alert'); expect(screen.queryByRole('img', { name: /QR code/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/raw secret-bearing/)).not.toBeInTheDocument();
  });
  it('discards an obsolete detail response on navigation', async () => {
    const old = deferred<Response>();
    const fetcher = boundary({ detail: (path) => path.endsWith(ticket.id) ? old.promise : ticketResponse({ ...ticket, id: '907f1f77bcf86cd799439012', event: { ...ticket.event!, title: 'Other experience' } }) }); show(detailPath);
    await screen.findByText('Loading ticket…');
    await waitFor(() => expect(fetcher.mock.calls.some(([path]) => path === '/api/tickets/' + ticket.id)).toBe(true));
    const oldSignal = fetcher.mock.calls.find(([path]) => path === '/api/tickets/' + ticket.id)![1].signal!;
    await userEvent.click(screen.getByRole('button', { name: 'Other ticket' })); await screen.findByRole('heading', { name: 'Other experience' });
    expect(oldSignal.aborted).toBe(true); await act(async () => old.resolve(ticketResponse())); expect(screen.queryByRole('heading', { name: ticket.event!.title })).not.toBeInTheDocument();
  });
  it('clears QR immediately when session verification becomes unavailable', async () => {
    let unavailable = false; boundary({ me: () => unavailable ? failure(503) : userResponse() }); show(detailPath);
    await screen.findByRole('img', { name: /QR code/ }); unavailable = true;
    await userEvent.click(screen.getByRole('button', { name: 'Revalidate identity' }));
    await waitFor(() => expect(screen.queryByRole('img', { name: /QR code/ })).not.toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: /Welcome back/ })).not.toBeInTheDocument();
  });
  it('clears QR on confirmed logout and blocks the protected view', async () => {
    boundary(); show(detailPath); await screen.findByRole('img', { name: /QR code/ });
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(screen.queryByRole('img', { name: /QR code/ })).not.toBeInTheDocument());
  });
  it.each([null, organizer])('guards guest and other-role navigation %#', async (user) => {
    const fetcher = boundary({ me: () => user ? userResponse(user) : failure(401) }); show(detailPath);
    await screen.findByRole('heading', { name: user ? 'This space belongs to another role.' : 'Welcome back.' });
    expect(fetcher.mock.calls.some(([path]) => path.startsWith('/api/tickets'))).toBe(false);
  });
  it('allowlists only attendee ticket destinations for post-login return', () => {
    expect(safeAuthDestination('ATTENDEE', detailPath)).toBe(detailPath); expect(safeAuthDestination('ORGANIZER', detailPath)).toBe('/organizer/dashboard');
    expect(safeAuthDestination('ATTENDEE', '//evil.test/attendee/tickets')).toBe('/attendee/dashboard');
  });
});
describe('explicit ticket generation', () => {
  it('waits for a successful POST and blocks rapid duplicate clicks before navigating', async () => {
    const pending = deferred<Response>(), fetcher = boundary({ issue: () => pending.promise }); show('/attendee/reservations/' + held.id);
    const button = await screen.findByRole('button', { name: 'Generate Ticket' }); fireEvent.click(button); fireEvent.click(button);
    expect(fetcher.mock.calls.filter(([path]) => path === issuePath)).toHaveLength(1);
    expect(screen.queryByRole('img', { name: /QR code/ })).not.toBeInTheDocument();
    await act(async () => pending.resolve(ticketResponse(ticket, 201))); await screen.findByRole('img', { name: /QR code/ });
    const init = fetcher.mock.calls.find(([path]) => path === issuePath)![1]; expect(init.method).toBe('POST'); expect(JSON.parse(init.body as string)).toEqual({});
  });
  it('restores an existing ticket link through a read without POSTing', async () => {
    const fetcher = boundary({ list: () => ticketList([summary()]) }); show('/attendee/reservations/' + held.id);
    expect(await screen.findByRole('link', { name: 'View Ticket' })).toHaveAttribute('href', detailPath);
    expect(fetcher.mock.calls.some(([path]) => path === issuePath)).toBe(false);
  });
  it('failed issuance preserves CONFIRMED and SUCCESS, then recovers an existing durable ticket', async () => {
    const fetcher = boundary({ issue: () => failure(503, 'TICKET_ISSUANCE_UNKNOWN') }); show('/attendee/reservations/' + held.id);
    await userEvent.click(await screen.findByRole('button', { name: 'Generate Ticket' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('may have been issued');
    expect(screen.getByText('Confirmed', { selector: '.reservation-status' })).toBeInTheDocument(); expect(screen.getByText('Simulated Success')).toBeInTheDocument();
    await screen.findByRole('link', { name: 'View Ticket' }); expect(fetcher.mock.calls.filter(([path]) => path === issuePath)).toHaveLength(1);
  });
});
describe('actual QR and export handling', () => {
  it('decodes the real Q-level matrix back to the exact server payload with a four-module quiet zone', () => {
    const matrix = qr.ticketQrMatrix(qrPayload), scale = 5, width = (matrix.size + 8) * scale;
    const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
    for (let y = 0; y < matrix.size; y++) for (let x = 0; x < matrix.size; x++) if (matrix.get(y, x)) for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const index = (((y + 4) * scale + dy) * width + (x + 4) * scale + dx) * 4; pixels[index] = 0; pixels[index + 1] = 0; pixels[index + 2] = 0;
    }
    expect(qr.QR_QUIET_ZONE).toBe(4); expect(jsQR(pixels, width, width)?.data).toBe(qrPayload);
  });
  it('shows a recoverable QR rendering error without inventing an image', () => {
    vi.spyOn(qr, 'ticketQrMatrix').mockImplementationOnce(() => { throw new Error('Encoder unavailable'); }); render(<TicketQr payload={qrPayload} />);
    expect(screen.getByRole('alert')).toHaveTextContent('couldn’t render'); expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
  it('uses the actual owned ticket in an explicit export and offers a safe retry on failure', async () => {
    const download = vi.spyOn(qr, 'downloadTicket').mockRejectedValueOnce(new Error('Canvas unavailable')).mockResolvedValueOnce(); boundary(); show(detailPath);
    await userEvent.click(await screen.findByRole('button', { name: 'Download Ticket PNG' })); await screen.findByRole('alert');
    expect(download).toHaveBeenCalledWith(ticket, attendee.name, expect.any(AbortSignal));
    await userEvent.click(screen.getByRole('button', { name: 'Download Ticket PNG' })); await waitFor(() => expect(download).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('suppresses a pending export after logout or unmount', async () => {
    const pending = deferred<void>(), download = vi.spyOn(qr, 'downloadTicket').mockReturnValue(pending.promise); boundary(); const view = show(detailPath);
    await userEvent.click(await screen.findByRole('button', { name: 'Download Ticket PNG' })); const signal = download.mock.calls[0]![2];
    view.unmount(); expect(signal.aborted).toBe(true); await act(async () => pending.resolve());
  });
});
