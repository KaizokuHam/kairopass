import type { Request, RequestHandler } from 'express';
import { ApiError } from '../../lib/api-error.js';
import * as service from './events.service.js';
import { createEventSchema, parseEventBody } from './events.validation.js';

function organizer(request: Request): string {
  if (!request.auth) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  return request.auth.user.id;
}

export const create: RequestHandler = async (req, res) => {
  const event = await service.createEvent(organizer(req), parseEventBody(req, createEventSchema));
  res.status(201).json({ success: true, data: { event } });
};
