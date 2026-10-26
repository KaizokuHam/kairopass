import type { Request } from 'express';
import { z } from 'zod';
import { USER_ROLES } from '../../models/User.model.js';
import { ApiError } from '../../lib/api-error.js';

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const password = z.string().min(8).max(128)
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 256, 'Password must not exceed 256 UTF-8 bytes');

export const registrationSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email,
  password,
  role: z.enum(USER_ROLES).default('ATTENDEE')
}).strict();
export const loginSchema = z.object({ email, password }).strict();
export type RegistrationInput = z.infer<typeof registrationSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export function parseAuthBody<T>(request: Request, schema: z.ZodType<T>): T {
  if (!request.is('application/json')) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Content-Type must be application/json.');
  }
  const result = schema.safeParse(request.body);
  if (!result.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid request input.', result.error.issues.map((issue) => ({
      field: issue.path.join('.') || 'body', message: issue.message
    })));
  }
  return result.data;
}
