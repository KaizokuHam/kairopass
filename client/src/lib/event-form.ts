import type { CreateEventInput, DraftEventUpdate, OrganizerEvent } from '@/types/events';
import { localDateTimeToIso, paiseToRupees, rupeesToPaise, toLocalDateTime } from './event-format';

export interface EventFormValues {
  title: string; description: string; venue: string; startAt: string; endAt: string;
  registrationDeadline: string; capacity: string; pricePaise: string;
}
export type EventFormErrors = Partial<Record<keyof EventFormValues, string>>;
export function initialEventValues(event?: OrganizerEvent): EventFormValues {
  return event ? { title: event.title, description: event.description, venue: event.venue,
    startAt: toLocalDateTime(event.startAt), endAt: toLocalDateTime(event.endAt), registrationDeadline: toLocalDateTime(event.registrationDeadline),
    capacity: String(event.capacity), pricePaise: paiseToRupees(event.pricePaise) }
    : { title: '', description: '', venue: '', startAt: '', endAt: '', registrationDeadline: '', capacity: '', pricePaise: '' };
}
export function validateEventForm(values: EventFormValues, published = false): { errors: EventFormErrors; input: CreateEventInput | null } {
  const errors: EventFormErrors = {};
  const title = values.title.trim(), description = values.description.trim(), venue = values.venue.trim();
  if (title.length < 3 || title.length > 120) errors.title = 'Use 3–120 characters for the event title.';
  if (description.length > 10_000) errors.description = 'Use at most 10,000 characters.';
  if (!venue || venue.length > 200) errors.venue = 'Enter a venue (at most 200 characters).';
  const capacity = /^\d+$/.test(values.capacity) ? Number(values.capacity) : NaN;
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 1_000_000) errors.capacity = 'Use a whole number from 1 to 1,000,000.';
  const pricePaise = rupeesToPaise(values.pricePaise);
  if (pricePaise === null) errors.pricePaise = 'Enter a nonnegative rupee amount with at most two decimal places and a safe total.';
  const startAt = localDateTimeToIso(values.startAt), endAt = localDateTimeToIso(values.endAt), registrationDeadline = localDateTimeToIso(values.registrationDeadline);
  if (!startAt) errors.startAt = 'Enter a valid local start date and time.';
  else if (!published && Date.parse(startAt) <= Date.now()) errors.startAt = 'The event must start in the future.';
  if (!endAt) errors.endAt = 'Enter a valid local end date and time.';
  else if (startAt && Date.parse(endAt) <= Date.parse(startAt)) errors.endAt = 'End must be after start.';
  if (!registrationDeadline) errors.registrationDeadline = 'Enter a valid local registration deadline.';
  else if (startAt && Date.parse(registrationDeadline) > Date.parse(startAt)) errors.registrationDeadline = 'Registration must close no later than the event starts.';
  return { errors, input: Object.keys(errors).length || !startAt || !endAt || !registrationDeadline || pricePaise === null ? null
    : { title, description, venue, startAt, endAt, registrationDeadline, capacity, pricePaise } };
}
export function changedEventFields(input: CreateEventInput, original: OrganizerEvent): DraftEventUpdate {
  const allowed = original.status === 'PUBLISHED' ? ['title', 'description', 'venue'] as const
    : ['title', 'description', 'venue', 'startAt', 'endAt', 'registrationDeadline', 'capacity', 'pricePaise'] as const;
  return Object.fromEntries(allowed.filter((key) => input[key] !== original[key]).map((key) => [key, input[key]]));
}
