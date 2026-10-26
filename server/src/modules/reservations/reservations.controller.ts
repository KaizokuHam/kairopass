import type { Request, RequestHandler } from 'express';
import { ApiError } from '../../lib/api-error.js';
import * as service from './reservations.service.js';
import { createReservationSchema, emptyBodySchema, listReservationsSchema, parseReservationInput, reservationId } from './reservations.validation.js';

function attendee(req: Request) {
  if (!req.auth) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  return req.auth.user.id;
}
export const create: RequestHandler = async (req, res) => {
  if (!req.is('application/json')) throw new ApiError(400, 'INVALID_RESERVATION_INPUT', 'Content-Type must be application/json.');
  const input = parseReservationInput(req.body, createReservationSchema);
  const data = await service.createReservation(attendee(req), input.eventId);
  res.status(data.created ? 201 : 200).json({ success: true, data: { ...data, serverNow: new Date(Date.now()).toISOString() } });
};
export const list: RequestHandler = async (req, res) => {
  const data = await service.listReservations(attendee(req), parseReservationInput(req.query, listReservationsSchema));
  res.json({ success: true, data });
};
export const get: RequestHandler = async (req, res) => {
  const reservation = await service.getReservation(attendee(req), reservationId(req.params.id));
  res.json({ success: true, data: { reservation, serverNow: new Date(Date.now()).toISOString() } });
};
export const cancel: RequestHandler = async (req, res) => {
  if (req.body !== undefined || (req.get('content-length') && req.get('content-length') !== '0') || req.get('transfer-encoding')) {
    if (!req.is('application/json')) throw new ApiError(400, 'INVALID_RESERVATION_INPUT', 'Content-Type must be application/json.');
    parseReservationInput(req.body, emptyBodySchema);
  }
  const reservation = await service.cancelReservation(attendee(req), reservationId(req.params.id));
  res.json({ success: true, data: { reservation, serverNow: new Date(Date.now()).toISOString() } });
};
