import { eventAvailability } from '@/lib/event-availability';
import type { PublicEvent } from '@/types/discovery';

export function EventAvailability({ event, now }: { event: PublicEvent; now: number }) {
  const availability = eventAvailability(event, now);
  return <span className={'discovery-availability is-' + availability.kind}><span aria-hidden="true" />{availability.label}</span>;
}
