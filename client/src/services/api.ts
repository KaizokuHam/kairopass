import type { HealthResponse } from '@/types/api';

export class ApiRequestError extends Error {
  constructor(message: string, public readonly status?: number,
    public readonly code = 'REQUEST_FAILED', public readonly requestId?: string,
    public readonly retryAfterSeconds?: number) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeMessage(status: number, code: string): string {
  if (status === 401 && code === 'INVALID_CREDENTIALS') return 'Invalid email or password. Please try again.';
  if (status === 401) return 'Please sign in to continue.';
  if (status === 403) return code === 'UNTRUSTED_ORIGIN'
    ? 'This request could not be verified. Reload the page and try again.' : 'You do not have access to this page.';
  if (status === 409) return 'An account with this email already exists. Sign in instead.';
  if (status === 429) return 'Too many attempts. Please try again later.';
  if (status === 400 || status === 422) return 'Please check your details and try again.';
  return 'The service is temporarily unavailable. Please try again.';
}

function retryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = /^\d+$/.test(value) ? Number(value) : Math.ceil((Date.parse(value) - Date.now()) / 1000);
  return Number.isFinite(seconds) ? Math.max(0, Math.min(86400, seconds)) : undefined;
}

interface RequestOptions<T> {
  method?: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  parse: (value: unknown) => T;
}

export async function request<T>(path: string, options: RequestOptions<T>): Promise<T> {
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('API paths must be local.');
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  const abortError = () => new ApiRequestError(timedOut
    ? 'This is taking longer than expected. Please try again.' : 'The request was cancelled.', undefined,
    timedOut ? 'TIMEOUT' : 'CANCELLED');
  if (options.signal?.aborted) throw abortError();
  options.signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? 15_000);
  try {
    const response = await fetch(`/api${path}`, {
      method: options.method ?? 'GET', credentials: 'same-origin', cache: 'no-store',
      headers: { Accept: 'application/json', ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}), signal: controller.signal
    });
    if (controller.signal.aborted) throw abortError();
    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw new ApiRequestError('The service returned an unexpected response. Please try again.', response.status, 'INVALID_RESPONSE');
    }
    let data: unknown;
    try { data = await response.json(); }
    catch { throw new ApiRequestError('The service returned an unexpected response. Please try again.', response.status, 'INVALID_RESPONSE'); }
    if (controller.signal.aborted) throw abortError();
    if (!response.ok) {
      const error = isRecord(data) && isRecord(data.error) ? data.error : {};
      const code = typeof error.code === 'string' && /^[A-Z_]{2,64}$/.test(error.code) ? error.code : 'REQUEST_FAILED';
      const id = typeof error.requestId === 'string' && /^[a-f\d-]{36}$/i.test(error.requestId) ? error.requestId : undefined;
      throw new ApiRequestError(safeMessage(response.status, code), response.status, code, id, retryAfter(response.headers.get('retry-after')));
    }
    return options.parse(data);
  } catch (error) {
    if (controller.signal.aborted) throw abortError();
    if (error instanceof ApiRequestError) throw error;
    throw new ApiRequestError('Could not connect. Check your connection and try again.', undefined, 'NETWORK_ERROR');
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}

export const api = {
  health(signal: AbortSignal): Promise<HealthResponse> {
    return request('/health', { signal, timeoutMs: 5000, parse(data) {
    if (typeof data !== 'object' || data === null || !('success' in data) ||
      data.success !== true || !('message' in data) || typeof data.message !== 'string') {
      throw new ApiRequestError('The API returned an unexpected response. Please try again.', undefined, 'INVALID_RESPONSE');
    }
    return { success: true, message: data.message };
    } });
  }
};
