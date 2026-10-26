import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { App } from '@/App';
import { AuthProvider } from '@/context/AuthProvider';
import { useAuth } from '@/hooks/useAuth';
import { startQrDecoder, type DecoderControls } from '@/lib/qr-scanner';
import { safeAuthDestination } from '@/lib/auth-navigation';
import { attendee, deferred, failure, json, organizer, userResponse } from './fixtures';
import { sampleEvent, eventResponse } from './events-fixtures';
import { ticket, ticketResponse, ticketList, summary } from './tickets-fixtures';
import { admitted, admissionEvent, admissionNow, alreadyUsed, checkInEvent, checkInResponse, historyResponse, qrPayload } from './checkin-fixtures';
import type { CheckInEntry } from '@/types/checkin';
vi.mock('@/lib/qr-scanner', () => ({ startQrDecoder: vi.fn() }));
const base = '/api/organizer/events/' + sampleEvent.id + '/check-ins', page = '/organizer/events/' + sampleEvent.id + '/check-in';
const originalMedia = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
let stopTrack: Mock<() => void>, stopDecoder: Mock<() => void>, media: Mock<(constraints: MediaStreamConstraints) => Promise<MediaStream>>;
let stream: MediaStream, frames: ((text: string) => void)[];
beforeEach(() => {
  stopTrack = vi.fn<() => void>(); stopDecoder = vi.fn<() => void>(); frames = [];
  stream = { getTracks: () => [{ stop: stopTrack }], getVideoTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
  media = vi.fn<(constraints: MediaStreamConstraints) => Promise<MediaStream>>().mockResolvedValue(stream);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: media, enumerateDevices: vi.fn().mockResolvedValue([{ kind: 'videoinput', deviceId: 'rear', label: 'Rear camera' }, { kind: 'videoinput', deviceId: 'front', label: 'Front camera' }]) } });
  vi.stubGlobal('isSecureContext', true); vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.mocked(startQrDecoder).mockReset().mockImplementation(async (_stream, video, callback) => { video.srcObject = _stream; frames.push(callback); return { stop: stopDecoder }; });
});
afterEach(() => { cleanup(); if (originalMedia) Object.defineProperty(navigator, 'mediaDevices', originalMedia); else Reflect.deleteProperty(navigator, 'mediaDevices'); vi.restoreAllMocks(); });
function Probe() {
  const navigate = useNavigate(), auth = useAuth();
  return <><button onClick={() => { void navigate('/organizer/events/607f1f77bcf86cd799439012/check-in'); }}>Other event</button><button onClick={() => { void auth.refreshSession(); }}>Revalidate identity</button></>;
}
function show(path = page) { return render(<MemoryRouter useTransitions={false} initialEntries={[path]}><AuthProvider><App /><Probe /></AuthProvider></MemoryRouter>); }
function boundary(options: { history?: (path: string) => Response | Promise<Response>; admit?: (init: RequestInit) => Response | Promise<Response>; me?: () => Response; ticket?: () => Response } = {}) {
  let entries: CheckInEntry[] = [];
  const fetcher = vi.fn(async (path: string, init: RequestInit) => {
    if (path === '/api/auth/me') return options.me?.() ?? userResponse(organizer);
    if (path === '/api/health') return json({ success: true, message: 'KairoPass API is running' });
    if (path === '/api/auth/logout') return json({ success: true, message: 'Logged out successfully.' });
    if (path.includes('/check-ins') && init.method === 'POST') { entries = [admitted]; return options.admit?.(init) ?? checkInResponse(); }
    if (path.includes('/check-ins?')) return options.history?.(path) ?? historyResponse(entries);
    if (path === '/api/organizer/events/' + sampleEvent.id) return eventResponse(checkInEvent);
    if (path.startsWith('/api/tickets/')) return options.ticket?.() ?? ticketResponse();
    if (path.startsWith('/api/tickets?')) return ticketList([summary()]);
    throw new Error('Unexpected check-in test HTTP route');
  });
  vi.stubGlobal('fetch', fetcher); return fetcher;
}
const posts = (fetcher: ReturnType<typeof boundary>) => fetcher.mock.calls.filter(([path, init]) => path.includes('/check-ins') && init.method === 'POST');
async function manualSubmit() {
  const operator = userEvent.setup();
  await operator.click(await screen.findByLabelText('Signed QR credential')); await operator.paste(qrPayload);
  await operator.click(screen.getByRole('button', { name: 'Verify & Check In' }));
}
async function start() { const button = await screen.findByRole('button', { name: 'Start camera' }); await waitFor(() => expect(button).toBeEnabled()); await userEvent.click(button); await screen.findByText('Scanning locally. Hold the complete QR inside the frame.'); }

describe('owned event admission workspace', () => {
  it('loads real event context, the admission window and empty history without requesting camera access', async () => {
    const fetcher = boundary(); show(); await screen.findByText('Check-in is open');
    expect(screen.getByText(sampleEvent.venue, { exact: false })).toBeInTheDocument(); await screen.findByText(/No successful check-ins yet/);
    expect(media).not.toHaveBeenCalled(); expect(posts(fetcher)).toHaveLength(0); expect(screen.getByRole('heading', { name: 'Ready for the next arrival.' })).toBeInTheDocument();
  });
  it('manual entry uses the typed signed-credential endpoint and displays only a confirmed result', async () => {
    const waiting = deferred<Response>(), fetcher = boundary({ admit: () => waiting.promise }); show(); await screen.findByText('Check-in is open');
    const input = screen.getByLabelText('Signed QR credential'); await userEvent.type(input, qrPayload); const button = screen.getByRole('button', { name: 'Verify & Check In' }); fireEvent.click(button); fireEvent.click(button);
    expect(posts(fetcher)).toHaveLength(1); expect(input).toHaveValue(''); expect(await screen.findByRole('heading', { name: 'Verifying admission…' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Entry Approved' })).not.toBeInTheDocument();
    await act(async () => waiting.resolve(checkInResponse())); await screen.findByRole('heading', { name: 'Entry Approved' });
    expect(screen.getAllByText(admitted.attendeeName).length).toBeGreaterThan(0); expect(screen.getByRole('heading', { name: 'Entry Approved' }).closest('section')).toHaveTextContent(admitted.ticketId);
    expect(posts(fetcher)[0]![1]).toMatchObject({ method: 'POST', credentials: 'same-origin', cache: 'no-store' }); expect(JSON.parse(posts(fetcher)[0]![1].body as string)).toEqual({ qrPayload });
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
  });
  it('rejects a bare ticket ID locally, without inventing approval or an insecure fallback request', async () => {
    const fetcher = boundary(); show(); await screen.findByText('Check-in is open'); await userEvent.type(screen.getByLabelText('Signed QR credential'), admitted.ticketId); await userEvent.click(screen.getByRole('button', { name: 'Verify & Check In' }));
    await screen.findByRole('heading', { name: 'Invalid Ticket — Entry Denied' }); expect(posts(fetcher)).toHaveLength(0);
  });
  it.each([['INVALID_QR_PAYLOAD', 400, 'Invalid Ticket — Entry Denied'], ['INVALID_TICKET', 404, 'Invalid Ticket — Entry Denied'], ['TICKET_REVOKED', 409, 'Ticket Revoked — Entry Denied'], ['CHECKIN_NOT_OPEN', 409, 'Check-In Not Available at This Time'], ['CHECKIN_CLOSED', 409, 'Check-In Not Available at This Time']])('shows authoritative rejection for %s', async (code, status, heading) => {
    boundary({ admit: () => failure(Number(status), code) }); show(); await screen.findByText('Check-in is open'); await manualSubmit(); await screen.findByRole('heading', { name: heading });
    expect(screen.queryByRole('heading', { name: 'Entry Approved' })).not.toBeInTheDocument(); expect(screen.queryByText(/raw secret-bearing/)).not.toBeInTheDocument();
  });
  it('already-used rejection includes the original safe admission timestamp and never approves replay', async () => {
    boundary({ admit: alreadyUsed }); show(); await screen.findByText('Check-in is open'); await manualSubmit();
    const heading = await screen.findByRole('heading', { name: 'Already Checked In — Entry Denied' }); expect(heading.closest('section')).toHaveTextContent('Previously checked in');
    expect(screen.queryByRole('heading', { name: 'Entry Approved' })).not.toBeInTheDocument();
  });
  it('explains throttling without falsely labelling the ticket invalid', async () => {
    boundary({ admit: () => failure(429, 'RATE_LIMITED') }); show(); await screen.findByText('Check-in is open'); await manualSubmit(); await screen.findByRole('heading', { name: 'Verification Paused' });
    expect(screen.queryByRole('heading', { name: 'Invalid Ticket — Entry Denied' })).not.toBeInTheDocument();
  });
  it('treats a lost response as uncertain and explicitly repeats the same credential without granting a second admission', async () => {
    let attempt = 0; const fetcher = boundary({ admit: () => ++attempt === 1 ? failure(503, 'CHECKIN_OUTCOME_UNKNOWN') : alreadyUsed() }); show(); await screen.findByText('Check-in is open'); await manualSubmit();
    await screen.findByRole('heading', { name: 'Admission Not Confirmed' }); expect(screen.queryByRole('heading', { name: /Entry Denied|Entry Approved/ })).not.toBeInTheDocument();
    expect(posts(fetcher)).toHaveLength(1); await userEvent.click(screen.getByRole('button', { name: 'Retry same credential' }));
    await screen.findByRole('heading', { name: 'Already Checked In — Entry Denied' }); expect(posts(fetcher)).toHaveLength(2); expect(posts(fetcher)[0]![1].body).toBe(posts(fetcher)[1]![1].body);
  });
  it.each(['network', 'malformed', 'wrong-event'])('never shows approval for %s uncertainty', async (kind) => {
    boundary({ admit: () => { if (kind === 'network') throw new Error('connection lost'); return kind === 'malformed' ? json({ success: true, data: {} }) : checkInResponse({ ...admitted, eventId: '607f1f77bcf86cd799439012' }); } }); show(); await screen.findByText('Check-in is open'); await manualSubmit(); await screen.findByRole('heading', { name: 'Admission Not Confirmed' });
  });
  it('Scan Next Ticket clears the prior result and never resubmits automatically', async () => {
    const fetcher = boundary(); show(); await screen.findByText('Check-in is open'); await manualSubmit(); await screen.findByRole('heading', { name: 'Entry Approved' });
    await userEvent.click(screen.getByRole('button', { name: 'Scan Next Ticket' })); await screen.findByRole('heading', { name: 'Ready for the next arrival.' }); expect(posts(fetcher)).toHaveLength(1); expect(screen.getByLabelText('Signed QR credential')).toHaveValue('');
  });
  it.each([
    ['NOT_OPEN', '2040-02-10T07:00:00.000Z', 'PUBLISHED'], ['CLOSED', '2040-02-10T13:00:00.000Z', 'PUBLISHED'],
    ['CANCELLED', admissionNow, 'CANCELLED'], ['UNPUBLISHED', admissionNow, 'DRAFT']
  ] as const)('disables admission controls for %s while retaining history access', async (state, serverNow, status) => {
    boundary({ history: () => historyResponse([], { event: { ...admissionEvent, status }, window: { opensAt: '2040-02-10T08:00:00.000Z', closesAt: sampleEvent.endAt, state }, serverNow }) }); show(); await screen.findByText(/No successful check-ins yet/);
    expect(screen.getByRole('button', { name: 'Start camera' })).toBeDisabled(); expect(screen.getByLabelText('Signed QR credential')).toBeDisabled(); expect(media).not.toHaveBeenCalled();
  });
  it('renders actual persisted history with bounded pages', async () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({ ...admitted, ticketId: '907f1f77bcf86cd7994390' + String(i + 20) }));
    boundary({ history: (path) => path.includes('page=2') ? historyResponse([admitted], { pagination: { page: 2, limit: 10, total: 11, totalPages: 2 } }) : historyResponse(entries, { pagination: { page: 1, limit: 10, total: 11, totalPages: 2 } }) }); show();
    await screen.findByText('Page 1 · 11 checked in'); await userEvent.click(screen.getByRole('button', { name: 'Next admissions' })); await screen.findByText('Page 2 · 11 checked in'); expect(screen.getByRole('button', { name: 'Next admissions' })).toBeDisabled();
  });
  it('preserves session identity on a recoverable history 503', async () => {
    let unavailable = true; boundary({ history: () => unavailable ? failure(503) : historyResponse() }); show(); await screen.findByRole('heading', { name: 'Admission context unavailable.' });
    expect(screen.queryByRole('heading', { name: 'Welcome back.' })).not.toBeInTheDocument(); unavailable = false; await userEvent.click(screen.getByRole('button', { name: 'Retry admission context' })); await screen.findByText('Check-in is open');
  });
  it.each([null, attendee])('resolves guest or wrong-role protection before requesting private history %#', async (user) => {
    const fetcher = boundary({ me: () => user ? userResponse(user) : failure(401) }); show(); await screen.findByRole('heading', { name: user ? 'This space belongs to another role.' : 'Welcome back.' }); expect(fetcher.mock.calls.some(([path]) => path.includes('/check-ins'))).toBe(false);
  });
  it('navigates from an owned published event and safely allows organizer login return', async () => {
    boundary(); show('/organizer/events/' + sampleEvent.id); const links = await screen.findAllByRole('link', { name: 'Manage Check-In' }); await userEvent.click(links[0]!); await screen.findByText('Check-in is open');
    expect(safeAuthDestination('ORGANIZER', page)).toBe(page); expect(safeAuthDestination('ATTENDEE', page)).toBe('/attendee/dashboard');
  });
  it('aborts and hides an obsolete event history response on navigation', async () => {
    const old = deferred<Response>(); const fetcher = boundary({ history: (path) => path.startsWith(base) ? old.promise : historyResponse([], { event: { ...admissionEvent, id: '607f1f77bcf86cd799439012', title: 'Other owned event' } }) }); show();
    await waitFor(() => expect(fetcher.mock.calls.some(([path]) => path.startsWith(base))).toBe(true)); const signal = fetcher.mock.calls.find(([path]) => path.startsWith(base))![1].signal!;
    await userEvent.click(screen.getByRole('button', { name: 'Other event' })); await screen.findByText('Other owned event'); expect(signal.aborted).toBe(true); await act(async () => old.resolve(historyResponse())); expect(screen.queryByText(sampleEvent.title, { exact: true })).not.toBeInTheDocument();
  });
  it('keyboard submission uses the same signed-credential path', async () => {
    boundary(); show(); await screen.findByText('Check-in is open'); await userEvent.type(screen.getByLabelText('Signed QR credential'), qrPayload); await userEvent.tab(); expect(screen.getByRole('button', { name: 'Verify & Check In' })).toHaveFocus(); await userEvent.keyboard('{Enter}'); await screen.findByRole('heading', { name: 'Entry Approved' });
  });
});
describe('camera acquisition, decoding and cleanup', () => {
  it('starts only on activation, prefers rear video without audio, and shows the real preview element', async () => {
    boundary(); show(); await start(); expect(media).toHaveBeenCalledWith({ audio: false, video: { facingMode: { ideal: 'environment' } } }); expect(screen.getByLabelText('Camera preview')).toHaveProperty('srcObject', stream);
  });
  it('stops camera and decoder, then permits supported camera selection', async () => {
    boundary(); show(); await start(); await userEvent.click(screen.getByRole('button', { name: 'Stop camera' })); expect(stopTrack).toHaveBeenCalled(); expect(stopDecoder).toHaveBeenCalled();
    await userEvent.selectOptions(screen.getByLabelText('Camera', { exact: true }), 'front'); await userEvent.click(screen.getByRole('button', { name: 'Start camera' })); await waitFor(() => expect(media).toHaveBeenCalledTimes(2)); expect(media.mock.calls[1]![0]).toEqual({ audio: false, video: { deviceId: { exact: 'front' } } });
  });
  it('one detected QR stops capture and starts only one verification across repeated frames', async () => {
    const waiting = deferred<Response>(), fetcher = boundary({ admit: () => waiting.promise }); show(); await start();
    act(() => { frames[0]!(qrPayload); frames[0]!(qrPayload); frames[0]!(qrPayload); });
    await screen.findByRole('heading', { name: 'Verifying admission…' }); expect(posts(fetcher)).toHaveLength(1); expect(stopTrack).toHaveBeenCalled(); expect(stopDecoder).toHaveBeenCalled(); expect(screen.getByRole('button', { name: 'Start camera' })).toBeDisabled();
    await act(async () => waiting.resolve(checkInResponse())); await screen.findByRole('heading', { name: 'Entry Approved' });
    await userEvent.click(screen.getByRole('button', { name: 'Scan Next Ticket' })); await screen.findByRole('heading', { name: 'Ready for the next arrival.' }); await start(); expect(media).toHaveBeenCalledTimes(2);
  });
  it.each([['NotAllowedError', /permission was denied/], ['NotFoundError', /No usable camera/], ['NotReadableError', /camera could not start/]])('handles %s with a usable manual fallback', async (name, message) => {
    media.mockRejectedValueOnce(new DOMException('private device detail', name as string)); boundary(); show(); await screen.findByText('Check-in is open'); await userEvent.click(screen.getByRole('button', { name: 'Start camera' })); await screen.findByText(message as RegExp); expect(screen.getByLabelText('Signed QR credential')).toBeEnabled(); await manualSubmit(); await screen.findByRole('heading', { name: 'Entry Approved' });
  });
  it('explains HTTPS/localhost requirements without requesting insecure camera access', async () => {
    vi.stubGlobal('isSecureContext', false); boundary(); show(); await screen.findByText('Check-in is open'); await userEvent.click(screen.getByRole('button', { name: 'Start camera' })); await screen.findByText(/Camera access needs HTTPS or localhost/); expect(media).not.toHaveBeenCalled();
  });
  it('releases tracks/preview on route unmount', async () => {
    boundary(); const view = show(); await start(); const preview = screen.getByLabelText('Camera preview'); view.unmount(); expect(stopTrack).toHaveBeenCalled(); expect(stopDecoder).toHaveBeenCalled(); expect(preview).toHaveProperty('srcObject', null);
  });
  it('stops a late permission result after navigation without attaching or decoding it', async () => {
    const waiting = deferred<MediaStream>(); media.mockReturnValueOnce(waiting.promise); boundary(); const view = show(); await screen.findByText('Check-in is open'); await userEvent.click(screen.getByRole('button', { name: 'Start camera' })); await screen.findByText('Requesting camera permission…'); view.unmount();
    await act(async () => waiting.resolve(stream)); expect(stopTrack).toHaveBeenCalled(); expect(startQrDecoder).not.toHaveBeenCalled();
  });
  it('stops decoder controls that resolve after the route has already unmounted', async () => {
    const waiting = deferred<DecoderControls>(); vi.mocked(startQrDecoder).mockReturnValueOnce(waiting.promise); boundary(); const view = show(); await screen.findByText('Check-in is open'); await userEvent.click(screen.getByRole('button', { name: 'Start camera' })); await waitFor(() => expect(startQrDecoder).toHaveBeenCalled()); view.unmount();
    await act(async () => waiting.resolve({ stop: stopDecoder })); expect(stopTrack).toHaveBeenCalled(); expect(stopDecoder).toHaveBeenCalled();
  });
  it('cleans up capture immediately on logout', async () => {
    boundary(); show(); await start(); await userEvent.click(screen.getByRole('button', { name: 'Sign out' })); await screen.findByRole('link', { name: 'Sign in' }); expect(stopTrack).toHaveBeenCalled(); expect(stopDecoder).toHaveBeenCalled();
  });
  it('stops capture and hides private context when identity verification becomes unavailable', async () => {
    let unavailable = false; boundary({ me: () => unavailable ? failure(503) : userResponse(organizer) }); show(); await start(); unavailable = true; await userEvent.click(screen.getByRole('button', { name: 'Revalidate identity' })); await waitFor(() => expect(screen.queryByLabelText('Camera preview')).not.toBeInTheDocument()); expect(stopTrack).toHaveBeenCalled();
  });
});
describe('attendee refresh after actual persisted USED response', () => {
  it('removes active QR/download and shows Already Used with the checked-in timestamp', async () => {
    let used = false; boundary({ me: () => userResponse(attendee), ticket: () => ticketResponse(used ? { ...ticket, status: 'USED', checkedInAt: admitted.checkedInAt, admissionState: 'USED', qrAvailable: false, qrPayload: null } : ticket) }); show('/attendee/tickets/' + ticket.id);
    await screen.findByRole('img', { name: /QR code/ }); used = true; await userEvent.click(screen.getByRole('button', { name: 'Refresh ticket' })); await screen.findByText('Already Used'); expect(screen.queryByRole('img', { name: /QR code/ })).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Download Ticket PNG' })).not.toBeInTheDocument(); expect(screen.getByText('CHECKED IN')).toBeInTheDocument();
  });
});
