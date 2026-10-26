import { PAYMENT_FAILURE_REASONS, type PaymentAttemptRecord } from '../../models/PaymentAttempt.model.js';
export function toAttendeePayment(payment: PaymentAttemptRecord) {
  return {
    id: payment._id.toString(), reservationId: payment.reservationId.toString(),
    transactionId: payment.transactionId, idempotencyKey: payment.idempotencyKey,
    amountPaise: payment.amountPaise, status: payment.status, simulated: true as const,
    simulationOutcome: payment.simulationOutcome ?? null,
    failureReason: payment.status !== 'FAILED' ? null : PAYMENT_FAILURE_REASONS.includes(payment.failureReason as typeof PAYMENT_FAILURE_REASONS[number]) ? payment.failureReason! : 'UNKNOWN_FAILURE',
    createdAt: payment.createdAt.toISOString(), updatedAt: payment.updatedAt.toISOString(),
    completedAt: payment.completedAt?.toISOString() ?? null
  };
}
export type AttendeePayment = ReturnType<typeof toAttendeePayment>;
