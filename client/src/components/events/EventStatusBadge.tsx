import type { EventStatus } from '@/types/events';
const labels = { DRAFT: 'Draft', PUBLISHED: 'Published', CANCELLED: 'Cancelled' };
export function EventStatusBadge({ status }: { status: EventStatus }) {
  return <span className={'event-status event-status-' + status.toLowerCase()}><span aria-hidden="true" />{labels[status]}</span>;
}
