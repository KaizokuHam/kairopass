import type { ReservationSnapshot } from './reservations';
import type { EventPagination } from './events';
export type SimulationOutcome = 'SUCCESS' | 'FAILURE';
export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED';
export interface PaymentAttempt {
  id: string; reservationId: string; transactionId: string; idempotencyKey: string;
  amountPaise: number; status: PaymentStatus; simulated: true; simulationOutcome: SimulationOutcome | null;
  failureReason: string | null; createdAt: string; updatedAt: string; completedAt: string | null;
}
export interface PaymentResult extends ReservationSnapshot { payment: PaymentAttempt }
export interface PaymentHistory extends ReservationSnapshot { payments: PaymentAttempt[]; pagination: EventPagination }
export interface LogicalPayment { key: string; outcome: SimulationOutcome; phase: PaymentStatus | 'UNCERTAIN'; paymentId?: string }
