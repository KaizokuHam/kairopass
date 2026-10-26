import type { EventRecord } from '../../models/Event.model.js';

/** Explicit organizer API contract; persistence metadata never leaves the module. */
export interface OrganizerEvent {
  id: string;
  organizerId: string;
  title: string;
  description: string;
  venue: string;
  startAt: string;
  endAt: string;
  registrationDeadline: string;
  capacity: number;
  pricePaise: number;
  reservedCount: number;
  status: EventRecord['status'];
  createdAt: string;
  updatedAt: string;
}
