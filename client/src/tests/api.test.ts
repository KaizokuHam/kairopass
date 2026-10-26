import { describe, expect, it, vi } from 'vitest';
import { api, ApiRequestError, request } from '@/services/api';
import { authApi } from '@/services/auth';
import { attendee, failure, json, userResponse } from './fixtures';

describe('typed same-origin API client', () => {
  it('preserves health requests and sends JSON/cookies without bearer or Origin headers', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ success: true, message: 'KairoPass API is running' })).mockResolvedValueOnce(userResponse());
    vi.stubGlobal('fetch', fetcher);
    expect((await api.health(new AbortController().signal)).success).toBe(true);
    expect(await authApi.login({ email: attendee.email, password: 'Test-only password' }, new AbortController().signal)).toEqual(attendee);
    expect(fetcher.mock.calls[1]?.[0]).toBe('/api/auth/login');
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({ credentials: 'same-origin', method: 'POST', cache: 'no-store', headers: { Accept: 'application/json', 'Content-Type': 'application/json' } });
    expect(fetcher.mock.calls[1]?.[1].headers).not.toHaveProperty('Origin');
    expect(fetcher.mock.calls[1]?.[1].headers).not.toHaveProperty('Authorization');
  });

  it.each([400, 401, 403, 409, 422, 429, 503])('preserves status/code and hides raw messages for HTTP %s', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(failure(status, status === 401 ? 'INVALID_CREDENTIALS' : 'REQUEST_FAILED')));
    try { await authApi.me(new AbortController().signal); throw new Error('Expected request failure'); }
    catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      expect((error as ApiRequestError).status).toBe(status);
      expect((error as ApiRequestError).requestId).toBeDefined();
      expect((error as Error).message).not.toContain('secret-bearing');
    }
  });

  it('parses Retry-After metadata', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ success: false, error: { code: 'RATE_LIMITED' } }, 429, { 'Retry-After': '120' })));
    await expect(authApi.me(new AbortController().signal)).rejects.toMatchObject({ status: 429, retryAfterSeconds: 120 });
  });

  it.each([
    () => new Response('<html>unavailable</html>', { status: 503, headers: { 'Content-Type': 'text/html' } }),
    () => new Response('{broken', { headers: { 'Content-Type': 'application/json' } }),
    () => json({ success: true, data: { user: null } }),
    () => json({ success: true, data: { user: { ...attendee, passwordHash: 'untrusted' } } })
  ])('rejects unexpected content and malformed contracts (case %#)', async (response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()));
    await expect(authApi.me(new AbortController().signal)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('distinguishes network failures and cancellation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('raw exception')));
    await expect(authApi.me(new AbortController().signal)).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    const controller = new AbortController(); controller.abort();
    await expect(authApi.me(controller.signal)).rejects.toMatchObject({ code: 'CANCELLED' });
  });

  it('bounds requests with a timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_path, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    })));
    const pending = request('/slow', { timeoutMs: 10, parse: (value) => value });
    const assertion = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(11); await assertion;
  });
});
