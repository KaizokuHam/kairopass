import type { EventRecord } from '../../models/Event.model.js';

export type PublicEventRecord = Pick<EventRecord, '_id' | 'title' | 'description' | 'venue' | 'startAt' | 'endAt' |
  'registrationDeadline' | 'capacity' | 'reservedCount' | 'pricePaise' | 'createdAt'>;

export interface PublicEvent {
  id: string;
  title: string;
  description: string;
  venue: string;
  startAt: string;
  endAt: string;
  registrationDeadline: string;
  capacity: number;
  reservedCount: number;
  pricePaise: number;
  status: 'PUBLISHED';
  createdAt: string;
}
