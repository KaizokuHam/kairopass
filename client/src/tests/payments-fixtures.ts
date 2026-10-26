import type { PaymentAttempt } from '@/types/payments';
import type { AttendeeReservation } from '@/types/reservations';
import { json } from './fixtures';
import { held, serverNow } from './reservations-fixtures';
export const paymentKey = '11111111-1111-4111-8111-111111111111';
export const successPayment: PaymentAttempt = {
  id: '807f1f77bcf86cd799439011', reservationId: held.id, transactionId: 'sim_22222222-2222-4222-8222-222222222222', idempotencyKey: paymentKey,
  amountPaise: held.amountPaise, status: 'SUCCESS', simulated: true, simulationOutcome: 'SUCCESS', failureReason: null,
  createdAt: serverNow, updatedAt: serverNow, completedAt: serverNow
};
export const failedPayment: PaymentAttempt = { ...successPayment, status: 'FAILED', simulationOutcome: 'FAILURE', failureReason: 'SIMULATED_PAYMENT_FAILURE' };
export const pendingPayment: PaymentAttempt = { ...successPayment, status: 'PENDING', completedAt: null };
export const confirmed: AttendeeReservation = { ...held, status: 'CONFIRMED' };
export const paymentResponse = (payment: PaymentAttempt = successPayment, reservation: AttendeeReservation = confirmed, now = serverNow) => json({ success: true, data: { payment, reservation, serverNow: now } });
export const paymentHistory = (payments: PaymentAttempt[] = [], metadata = {}, reservation: AttendeeReservation = held) => json({ success: true, data: {
  payments, reservation, serverNow, pagination: { page: 1, limit: 10, total: payments.length, totalPages: payments.length ? 1 : 0, ...metadata }
} });
