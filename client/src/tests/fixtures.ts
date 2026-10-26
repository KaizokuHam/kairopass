import type { AuthUser } from '@/types/auth';

export const attendee: AuthUser = {
  id: '507f1f77bcf86cd799439011', name: 'Asha Rao', email: 'asha@example.test', role: 'ATTENDEE',
  createdAt: '2026-10-26T04:00:00.000Z', updatedAt: '2026-10-26T04:00:00.000Z'
};
export const organizer: AuthUser = { ...attendee, id: '507f1f77bcf86cd799439012', name: 'Kai Sen', role: 'ORGANIZER' };
export const userResponse = (user: AuthUser = attendee) => json({ success: true, data: { user } });
export function json(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}
export const failure = (status: number, code = 'REQUEST_FAILED') => json({ success: false, error: { code, message: 'never display a raw secret-bearing server message', requestId: '00000000-0000-4000-a000-000000000000' } }, status);
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => { resolve = finish; });
  return { promise, resolve };
}
