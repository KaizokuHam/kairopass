import type { PaymentStatus } from '@/types/payments';
export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <span className={'payment-status is-' + status.toLowerCase()}>{status === 'PENDING' ? 'Pending' : status === 'SUCCESS' ? 'Simulated Success' : 'Simulated Failure'}</span>;
}
