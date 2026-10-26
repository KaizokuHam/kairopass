import { z } from 'zod';
import { ApiError } from '../../lib/api-error.js';
import { SIMULATION_OUTCOMES } from '../../models/PaymentAttempt.model.js';
export const idempotencyKeySchema = z.string().regex(/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i).transform((key) => key.toLowerCase());
export const paymentInputSchema = z.object({ simulationOutcome: z.enum(SIMULATION_OUTCOMES) }).strict();
export type PaymentInput = z.infer<typeof paymentInputSchema>;
const page = (max: number) => z.string().regex(/^[1-9]\d{0,4}$/).transform(Number).pipe(z.number().int().max(max));
export const paymentHistorySchema = z.object({
  page: page(10000).default(1), limit: page(50).default(10), idempotencyKey: idempotencyKeySchema.optional()
}).strict();
export type PaymentHistoryInput = z.infer<typeof paymentHistorySchema>;
export function parsePaymentInput<T>(value: unknown, schema: z.ZodType<T>): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(400, 'PAYMENT_INVALID_INPUT', 'Provide a UUID v4 Idempotency-Key and a valid simulation outcome.');
  return result.data;
}
export function paymentId(value: unknown) {
  const result = z.string().regex(/^[a-f\d]{24}$/i).safeParse(value);
  if (!result.success) throw new ApiError(404, 'PAYMENT_ATTEMPT_NOT_FOUND', 'Payment attempt not found.');
  return result.data;
}
