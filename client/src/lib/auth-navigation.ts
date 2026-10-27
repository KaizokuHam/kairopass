import type { UserRole } from '@/types/auth';

export const dashboardPath = (role: UserRole) => role === 'ORGANIZER' ? '/organizer/dashboard' : '/attendee/dashboard';

/** Only implemented local routes accessible to the verified role can be return destinations. */
export function safeAuthDestination(role: UserRole, requested: unknown): string {
  const fallback = dashboardPath(role);
  if (typeof requested !== 'string' || !requested.startsWith('/') || requested.startsWith('//') || requested.includes('\\') || Array.from(requested).some((character) => character.charCodeAt(0) < 32)) return fallback;
  try {
    const url = new URL(requested, 'https://kairopass.invalid');
    const organizerRoute = role === 'ORGANIZER' && (/^\/organizer\/events(?:\/new|\/[a-f\d]{24}(?:\/(?:edit|check-in|analytics))?)?$/.test(url.pathname) || url.pathname === '/organizer/analytics');
    const attendeeRoute = role === 'ATTENDEE' && /^\/attendee\/(?:reservations|tickets)(?:\/[a-f\d]{24})?$/.test(url.pathname);
    const publicEvent = /^\/events\/[a-f\d]{24}$/.test(url.pathname);
    return url.origin === 'https://kairopass.invalid' && (url.pathname === fallback || organizerRoute || attendeeRoute || publicEvent) ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch { return fallback; }
}
