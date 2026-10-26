import { StrictMode, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/context/AuthProvider';
import { useAuth } from '@/hooks/useAuth';
import { attendee, deferred, failure, json, organizer, userResponse } from './fixtures';

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
const credentials = { email: attendee.email, password: 'Test-only password' };

describe('race-safe authentication state', () => {
  it('restores a user, and treats only /me 401 as confirmed signed out', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(userResponse()).mockResolvedValueOnce(failure(401));
    vi.stubGlobal('fetch', fetcher);
    const { result } = renderHook(useAuth, { wrapper });
    await waitFor(() => expect(result.current.status).toBe('AUTHENTICATED'));
    await act(() => result.current.refreshSession());
    expect(result.current.status).toBe('UNAUTHENTICATED');
    expect(result.current.user).toBeNull();
  });

  it('retains known identity on 503 and recovers by retrying', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(userResponse()).mockResolvedValueOnce(failure(503)).mockResolvedValueOnce(userResponse()));
    const { result } = renderHook(useAuth, { wrapper });
    await waitFor(() => expect(result.current.status).toBe('AUTHENTICATED'));
    await act(() => result.current.refreshSession());
    expect(result.current.status).toBe('UNAVAILABLE');
    expect(result.current.user).toEqual(attendee);
    await act(() => result.current.refreshSession());
    expect(result.current.status).toBe('AUTHENTICATED');
  });

  it('ignores a stale restoration after a successful login even if the HTTP mock ignores abort', async () => {
    const old = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(userResponse()));
    const { result } = renderHook(useAuth, { wrapper });
    await act(() => result.current.login(credentials));
    await act(async () => { old.resolve(failure(401)); });
    expect(result.current.status).toBe('AUTHENTICATED');
    expect(result.current.user).toEqual(attendee);
  });

  it('prevents refresh from restoring a logged-out session and waits for backend logout success', async () => {
    const old = deferred<Response>(); const logout = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(userResponse()).mockReturnValueOnce(old.promise).mockReturnValueOnce(logout.promise));
    const { result } = renderHook(useAuth, { wrapper });
    await waitFor(() => expect(result.current.status).toBe('AUTHENTICATED'));
    let refresh!: Promise<void>; let pending!: Promise<void>;
    act(() => { refresh = result.current.refreshSession(); });
    act(() => { pending = result.current.logout(); });
    expect(result.current.user).toEqual(attendee);
    await act(async () => { logout.resolve(json({ success: true, message: 'Logged out successfully.' })); await pending; old.resolve(userResponse()); await refresh; });
    expect(result.current.status).toBe('UNAUTHENTICATED');
    expect(result.current.user).toBeNull();
  });

  it('does not let stale restoration overwrite a newly registered organizer', async () => {
    const old = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(userResponse(organizer)));
    const { result } = renderHook(useAuth, { wrapper });
    await act(() => result.current.register({ ...credentials, name: organizer.name, role: 'ORGANIZER' }));
    await act(async () => { old.resolve(userResponse(attendee)); });
    expect(result.current.user).toEqual(organizer);
    expect(result.current.status).toBe('AUTHENTICATED');
  });

  it('accepts only the latest concurrent refresh and recovers from a network failure', async () => {
    const old = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockReturnValueOnce(old.promise).mockResolvedValueOnce(userResponse()));
    const { result } = renderHook(useAuth, { wrapper });
    await waitFor(() => expect(result.current.status).toBe('UNAVAILABLE'));
    let refresh!: Promise<void>;
    act(() => { refresh = result.current.refreshSession(); });
    await act(() => result.current.refreshSession());
    await act(async () => { old.resolve(failure(401)); await refresh; });
    expect(result.current.status).toBe('AUTHENTICATED');
    expect(result.current.user).toEqual(attendee);
  });

  it('aborts an in-flight mutation when its provider unmounts', async () => {
    const pending = deferred<Response>();
    const fetcher = vi.fn().mockResolvedValueOnce(failure(401)).mockReturnValueOnce(pending.promise);
    vi.stubGlobal('fetch', fetcher);
    const { result, unmount } = renderHook(useAuth, { wrapper });
    await waitFor(() => expect(result.current.status).toBe('UNAUTHENTICATED'));
    let login!: Promise<unknown>;
    act(() => { login = result.current.login(credentials); });
    const rejected = expect(login).rejects.toMatchObject({ code: 'CANCELLED' });
    unmount();
    expect(fetcher.mock.calls.at(-1)?.[1].signal.aborted).toBe(true);
    await act(async () => { pending.resolve(userResponse()); await rejected; });
  });

  it('serializes mutations and does not pretend logout succeeded when offline', async () => {
    const pending = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(userResponse()).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(failure(503)));
    const { result } = renderHook(useAuth, { wrapper });
    await waitFor(() => expect(result.current.status).toBe('AUTHENTICATED'));
    let first!: Promise<unknown>;
    act(() => { first = result.current.login(credentials); });
    await expect(result.current.login(credentials)).rejects.toMatchObject({ code: 'BUSY' });
    await act(async () => { pending.resolve(userResponse()); await first; });
    await act(async () => { await expect(result.current.logout()).rejects.toMatchObject({ status: 503 }); });
    expect(result.current.status).toBe('UNAVAILABLE');
    expect(result.current.user).toEqual(attendee);
  });

  it('handles StrictMode setup/cleanup and unmount without accepting stale results', async () => {
    const fetcher = vi.fn().mockResolvedValue(userResponse()); vi.stubGlobal('fetch', fetcher);
    const strict = ({ children }: { children: ReactNode }) => <StrictMode><AuthProvider>{children}</AuthProvider></StrictMode>;
    const { result, unmount } = renderHook(useAuth, { wrapper: strict });
    await waitFor(() => expect(result.current.status).toBe('AUTHENTICATED'));
    const pending = deferred<Response>();
    fetcher.mockReturnValueOnce(pending.promise);
    let refresh!: Promise<void>;
    act(() => { refresh = result.current.refreshSession(); });
    unmount();
    expect(fetcher.mock.calls.at(-1)?.[1].signal.aborted).toBe(true);
    await act(async () => { pending.resolve(userResponse()); await refresh; });
  });
});
