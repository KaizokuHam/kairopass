import type { HealthResponse } from '@/types/api';

export class ApiRequestError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

// Keep API paths relative so dev proxy and production single-origin use the same client.
async function get(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(`/api${path}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)])
  });
  if (!response.ok) {
    throw new ApiRequestError('The API is temporarily unavailable. Please try again.', response.status);
  }
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new ApiRequestError('The API returned an unexpected response. Please try again.');
  }
  return response.json();
}

export const api = {
  async health(signal: AbortSignal): Promise<HealthResponse> {
    const data = await get('/health', signal);
    if (typeof data !== 'object' || data === null || !('success' in data) ||
      data.success !== true || !('message' in data) || typeof data.message !== 'string') {
      throw new ApiRequestError('The API returned an unexpected response. Please try again.');
    }
    return { success: true, message: data.message };
  }
};
