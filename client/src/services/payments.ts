import { ApiRequestError, isRecord, request } from './api';
import { parseReservation } from './reservations';
import type { PaymentAttempt, PaymentHistory, PaymentResult, SimulationOutcome } from '@/types/payments';

const idPattern = /^[a-f\d]{24}$/i;
export const paymentKeyPattern = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const reasons = ['SIMULATED_PAYMENT_FAILURE', 'RESERVATION_EXPIRED', 'RESERVATION_CANCELLED', 'RESERVATION_ALREADY_CONFIRMED', 'EVENT_NOT_PAYABLE', 'PAYMENT_AMOUNT_MISMATCH', 'SIMULATION_REQUEST_UNAVAILABLE', 'UNKNOWN_FAILURE'];
function invalid(): never { throw new ApiRequestError('Payment status could not be verified. Check its status before resuming the same attempt.', undefined, 'INVALID_RESPONSE'); }
export function parsePayment(value: unknown): PaymentAttempt {
  if (!isRecord(value) || Object.keys(value).some((key) => !['id', 'reservationId', 'transactionId', 'idempotencyKey', 'amountPaise', 'status', 'simulated', 'simulationOutcome', 'failureReason', 'createdAt', 'updatedAt', 'completedAt'].includes(key)) ||
    !['id', 'reservationId'].every((key) => typeof value[key] === 'string' && idPattern.test(value[key])) ||
    typeof value.transactionId !== 'string' || !/^[a-z\d_-]{1,128}$/i.test(value.transactionId) ||
    typeof value.idempotencyKey !== 'string' || value.idempotencyKey.length < 1 || value.idempotencyKey.length > 128 ||
    typeof value.amountPaise !== 'number' || !Number.isSafeInteger(value.amountPaise) || value.amountPaise < 0 ||
    !['PENDING', 'SUCCESS', 'FAILED'].includes(String(value.status)) || value.simulated !== true ||
    !(value.simulationOutcome === null || ['SUCCESS', 'FAILURE'].includes(String(value.simulationOutcome))) ||
    !(value.failureReason === null || reasons.includes(String(value.failureReason))) ||
    !date(value.createdAt) || !date(value.updatedAt) || !(value.completedAt === null || date(value.completedAt))) return invalid();
  if ((value.status !== 'FAILED' && value.failureReason !== null) || (value.status === 'PENDING' && value.completedAt !== null)) return invalid();
  return { ...value } as unknown as PaymentAttempt;
}
function envelope(value: unknown) {
  if (!isRecord(value) || value.success !== true || !isRecord(value.data) || !date(value.data.serverNow)) return invalid();
  return value.data;
}
function snapshot(data: Record<string, unknown>) {
  return { reservation: parseReservation(data.reservation), serverNow: data.serverNow as string, receivedAt: Date.now() };
}
function validateAssociation(payment: PaymentAttempt, reservation: PaymentResult['reservation']) {
  if (payment.reservationId !== reservation.id || (payment.status === 'SUCCESS' && (reservation.status !== 'CONFIRMED' || payment.amountPaise !== reservation.amountPaise))) invalid();
}
function single(value: unknown): PaymentResult {
  const data = envelope(value), result = { ...snapshot(data), payment: parsePayment(data.payment) };
  validateAssociation(result.payment, result.reservation); return result;
}
function list(value: unknown): PaymentHistory {
  const data = envelope(value);
  if (!Array.isArray(data.payments) || !isRecord(data.pagination)) return invalid();
  const p = data.pagination;
  if (!['page', 'limit', 'total', 'totalPages'].every((key) => typeof p[key] === 'number' && Number.isSafeInteger(p[key]) && p[key] >= 0)) return invalid();
  const pagination = p as unknown as PaymentHistory['pagination'], payments = data.payments.map(parsePayment), state = snapshot(data);
  const { page, limit, total, totalPages } = pagination;
  if (page < 1 || page > 10000 || limit < 1 || limit > 50 || totalPages !== Math.ceil(total / limit) ||
    payments.length !== Math.max(0, Math.min(limit, total - (page - 1) * limit)) || new Set(payments.map((payment) => payment.id)).size !== payments.length) return invalid();
  payments.forEach((payment) => validateAssociation(payment, state.reservation));
  return { ...state, payments, pagination: { page, limit, total, totalPages } };
}
function resource(id: string) {
  if (!idPattern.test(id)) throw new ApiRequestError('This reservation could not be found.', 404, 'RESERVATION_NOT_FOUND');
  return '/reservations/' + id + '/payments';
}
export const paymentsApi = {
  process: (id: string, key: string, simulationOutcome: SimulationOutcome, signal: AbortSignal) => request(resource(id), { method: 'POST', signal, idempotencyKey: key, body: { simulationOutcome }, parse: single }),
  history: (id: string, page: number, signal: AbortSignal, key?: string) => request(resource(id) + '?' + new URLSearchParams({ page: String(page), limit: '10', ...(key ? { idempotencyKey: key } : {}) }), { signal, parse: list }),
  get: (id: string, paymentId: string, signal: AbortSignal) => {
    if (!idPattern.test(paymentId)) throw new ApiRequestError('This payment attempt could not be found.', 404, 'PAYMENT_ATTEMPT_NOT_FOUND');
    return request(resource(id) + '/' + paymentId, { signal, parse: single });
  }
};
