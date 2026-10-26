import { StrictMode, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/context/AuthProvider';
import { useOrganizerEvents } from '@/hooks/useOrganizerEvents';
import { useEventMutation } from '@/hooks/useEventMutation';
import { useAuth } from '@/hooks/useAuth';
import { eventsApi } from '@/services/events';
import { deferred, failure, json, organizer, userResponse } from './fixtures';
import { eventResponse, eventsResponse, sampleEvent } from './events-fixtures';

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
describe('organizer-scoped request state', () => {
  it('discards stale list results after filters change, even if the HTTP stub ignores abort', async () => {
    const old = deferred<Response>();
    const fetcher = vi.fn((path: string) => Promise.resolve(path === '/api/auth/me' ? userResponse(organizer) : path.includes('status=DRAFT') ? old.promise : eventsResponse([])));
    vi.stubGlobal('fetch', fetcher);
    const { result, rerender } = renderHook(({ status }: { status: 'DRAFT' | 'PUBLISHED' }) => useOrganizerEvents({ status }), { wrapper, initialProps: { status: 'DRAFT' } });
    await waitFor(() => expect(fetcher.mock.calls.some(([path]) => path.includes('status=DRAFT'))).toBe(true));
    rerender({ status: 'PUBLISHED' });
    await waitFor(() => expect(result.current.data?.events).toEqual([]));
    await act(async () => { old.resolve(eventsResponse()); });
    expect(result.current.data?.events).toEqual([]);
  });
  it('recovers from network failure without calling it an empty list', async () => {
    let failed = true;
    vi.stubGlobal('fetch', vi.fn((path: string) => path === '/api/auth/me' ? Promise.resolve(userResponse(organizer))
      : failed ? Promise.reject(new TypeError('offline')) : Promise.resolve(eventsResponse())));
    const { result } = renderHook(() => useOrganizerEvents({}), { wrapper });
    await waitFor(() => expect(result.current.error?.code).toBe('NETWORK_ERROR'));
    expect(result.current.data).toBeNull(); failed = false;
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data?.events[0]?.id).toBe(sampleEvent.id));
  });
  it('invalidates organizer data on logout and never loads it for an unresolved session', async () => {
    const me = deferred<Response>();
    const fetcher = vi.fn((path: string) => Promise.resolve(path === '/api/auth/me' ? me.promise : path === '/api/auth/logout' ? json({ success: true, message: 'Logged out successfully.' }) : eventsResponse()));
    vi.stubGlobal('fetch', fetcher);
    const { result } = renderHook(() => ({ events: useOrganizerEvents({}), auth: useAuth() }), { wrapper });
    expect(fetcher.mock.calls).toHaveLength(1);
    await act(async () => { me.resolve(userResponse(organizer)); });
    await waitFor(() => expect(result.current.events.data?.events).toHaveLength(1));
    await act(() => result.current.auth.logout());
    expect(result.current.events.data).toBeNull();
  });
  it('revalidates an expired session through /me', async () => {
    let checks = 0;
    vi.stubGlobal('fetch', vi.fn((path: string) => Promise.resolve(path === '/api/auth/me' ? ++checks === 1 ? userResponse(organizer) : failure(401) : failure(401))));
    const { result } = renderHook(() => ({ events: useOrganizerEvents({}), auth: useAuth() }), { wrapper });
    await waitFor(() => expect(result.current.auth.status).toBe('UNAUTHENTICATED'));
    expect(result.current.events.data).toBeNull(); expect(checks).toBe(2);
  });
  it('rejects unexpected ownership and handles StrictMode cleanup', async () => {
    vi.stubGlobal('fetch', vi.fn((path: string) => Promise.resolve(path === '/api/auth/me' ? userResponse(organizer) : eventsResponse([{ ...sampleEvent, organizerId: '507f1f77bcf86cd799439099' }]))));
    const strict = ({ children }: { children: ReactNode }) => <StrictMode><AuthProvider>{children}</AuthProvider></StrictMode>;
    const { result } = renderHook(() => useOrganizerEvents({}), { wrapper: strict });
    await waitFor(() => expect(result.current.error?.code).toBe('INVALID_RESPONSE'));
    expect(result.current.data).toBeNull();
  });
  it('serializes mutations and aborts work when its component unmounts', async () => {
    const pending = deferred<Response>();
    const fetcher = vi.fn((path: string) => Promise.resolve(path === '/api/auth/me' ? userResponse(organizer) : pending.promise));
    vi.stubGlobal('fetch', fetcher);
    const { result, unmount } = renderHook(() => ({ mutation: useEventMutation(), auth: useAuth() }), { wrapper });
    await waitFor(() => expect(result.current.auth.status).toBe('AUTHENTICATED'));
    let operation!: Promise<unknown>;
    act(() => { operation = result.current.mutation.run((signal) => eventsApi.publishEvent(sampleEvent.id, signal)); });
    const rejected = expect(operation).rejects.toMatchObject({ code: 'CANCELLED' });
    await expect(result.current.mutation.run((signal) => eventsApi.cancelEvent(sampleEvent.id, signal))).rejects.toMatchObject({ code: 'BUSY' });
    unmount(); await act(async () => { pending.resolve(eventResponse()); await rejected; });
  });
});
