import type { UserRole } from '@/types/auth';

export const dashboardPath = (role: UserRole) => role === 'ORGANIZER' ? '/organizer/dashboard' : '/attendee/dashboard';

/** Only an existing dashboard accessible to the verified role can be a return destination. */
export function safeAuthDestination(role: UserRole, requested: unknown): string {
  const fallback = dashboardPath(role);
  if (typeof requested !== 'string' || !requested.startsWith('/') || requested.startsWith('//') || requested.includes('\\') || Array.from(requested).some((character) => character.charCodeAt(0) < 32)) return fallback;
  try {
    const url = new URL(requested, 'https://kairopass.invalid');
    return url.origin === 'https://kairopass.invalid' && url.pathname === fallback ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch { return fallback; }
}
