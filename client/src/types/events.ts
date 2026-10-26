export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED';
export interface OrganizerEvent {
  id: string; organizerId: string; title: string; description: string; venue: string;
  startAt: string; endAt: string; registrationDeadline: string;
  capacity: number; pricePaise: number; reservedCount: number; status: EventStatus;
  createdAt: string; updatedAt: string;
}
export interface CreateEventInput {
  title: string; description: string; venue: string; startAt: string; endAt: string;
  registrationDeadline: string; capacity: number; pricePaise: number;
}
export type DraftEventUpdate = Partial<CreateEventInput>;
export type PublishedEventUpdate = Partial<Pick<CreateEventInput, 'title' | 'description' | 'venue'>>;
export interface EventListQuery { page?: number; limit?: number; status?: EventStatus; sort?: 'newest' | 'oldest'; search?: string }
export interface EventPagination { page: number; limit: number; total: number; totalPages: number }
export interface OrganizerEventList { events: OrganizerEvent[]; pagination: EventPagination }
