import type { PublicEvent } from '@/types/discovery';

export function eventAvailability(event: Pick<PublicEvent, 'startAt' | 'registrationDeadline' | 'capacity' | 'reservedCount'> & { status: string }, now: number) {
  if (event.status !== 'PUBLISHED' || Date.parse(event.startAt) <= now) return { kind: 'unavailable', label: 'Event started / unavailable' } as const;
  if (Date.parse(event.registrationDeadline) <= now) return { kind: 'closed', label: 'Registration closed' } as const;
  if (event.capacity - event.reservedCount <= 0) return { kind: 'sold-out', label: 'Sold out' } as const;
  return { kind: 'open', label: 'Registration open' } as const;
}
