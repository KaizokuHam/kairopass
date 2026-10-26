import type { Request } from 'express';
import { z } from 'zod';
import { ApiError } from '../../lib/api-error.js';
import { EVENT_STATUSES } from '../../models/Event.model.js';

const title = z.string().trim().min(3).max(120);
const description = z.string().trim().max(10_000);
const venue = z.string().trim().min(1).max(200);
const capacity = z.number().int().min(1).max(1_000_000);
const pricePaise = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const dateTime = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

const bodyFields = { title, description, venue, startAt: dateTime, endAt: dateTime,
  registrationDeadline: dateTime, capacity, pricePaise };
export const createEventSchema = z.object({ ...bodyFields, description: description.default('') }).strict();
export type CreateEventInput = z.infer<typeof createEventSchema>;
export const eventIdSchema = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i, 'A valid event ObjectId is required.') }).strict();
const pageNumber = (maximum: number) => z.string().regex(/^[1-9]\d{0,4}$/).transform(Number).pipe(z.number().int().max(maximum));
export const listEventsSchema = z.object({
  page: pageNumber(10_000).default(1), limit: pageNumber(50).default(10),
  status: z.enum(EVENT_STATUSES).optional(), sort: z.enum(['newest', 'oldest']).default('newest'),
  search: z.string().trim().max(120).optional()
}).strict();
export type ListEventsInput = z.infer<typeof listEventsSchema>;

export const completeEventSchema = z.object({
  title, description, venue, startAt: z.date(), endAt: z.date(), registrationDeadline: z.date(), capacity, pricePaise
}).superRefine((event, context) => {
  if (event.endAt <= event.startAt) context.addIssue({ code: 'custom', path: ['endAt'], message: 'End must be after start.' });
  if (event.registrationDeadline > event.startAt) context.addIssue({ code: 'custom', path: ['registrationDeadline'], message: 'Registration deadline must not exceed start.' });
});

export function parseEventInput<T>(value: unknown, schema: z.ZodType<T>, status = 400, code = 'INVALID_EVENT_INPUT'): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiError(status, code, 'Invalid event input.', parsed.error.issues.map((issue) => ({
    field: issue.path.join('.') || 'input', message: issue.message
  })));
  return parsed.data;
}

export function parseEventBody<T>(request: Request, schema: z.ZodType<T>): T {
  if (!request.is('application/json')) throw new ApiError(400, 'INVALID_EVENT_INPUT', 'Content-Type must be application/json.');
  return parseEventInput(request.body, schema);
}
