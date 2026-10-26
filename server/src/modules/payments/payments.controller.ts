import type { Request, RequestHandler } from 'express';
import { ApiError } from '../../lib/api-error.js';
import { reservationId } from '../reservations/reservations.validation.js';
import { idempotencyKeySchema, parsePaymentInput, paymentHistorySchema, paymentId, paymentInputSchema } from './payments.validation.js';
import * as service from './payments.service.js';
function attendee(req: Request) {
  if (!req.auth) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  return req.auth.user.id;
}
export const process: RequestHandler = async (req, res) => {
  if (!req.is('application/json')) throw new ApiError(400, 'PAYMENT_INVALID_INPUT', 'Content-Type must be application/json.');
  const input = parsePaymentInput(req.body, paymentInputSchema), key = parsePaymentInput(req.get('Idempotency-Key'), idempotencyKeySchema);
  const data = await service.processPayment(attendee(req), reservationId(req.params.id), key, input);
  res.json({ success: true, data });
};
export const list: RequestHandler = async (req, res) => {
  const data = await service.listPayments(attendee(req), reservationId(req.params.id), parsePaymentInput(req.query, paymentHistorySchema));
  res.json({ success: true, data });
};
export const get: RequestHandler = async (req, res) => {
  const data = await service.getPayment(attendee(req), reservationId(req.params.id), paymentId(req.params.paymentId));
  res.json({ success: true, data });
};
