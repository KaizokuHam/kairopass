import type { EventPagination } from './events';

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
export type DiscoverySort = 'soonest' | 'latest' | 'price_asc' | 'price_desc';
export type DiscoveryPrice = 'all' | 'free' | 'paid';
export interface DiscoveryQuery {
  q: string;
  venue: string;
  price: DiscoveryPrice;
  sort: DiscoverySort;
  page: number;
  limit: number;
  from: string;
  to: string;
}
export interface PublicEventList { events: PublicEvent[]; pagination: EventPagination }
