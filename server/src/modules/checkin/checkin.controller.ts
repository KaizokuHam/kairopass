import type { RequestHandler } from 'express';
import { ApiError } from '../../lib/api-error.js';
import type { TicketConfig } from '../tickets/tickets.crypto.js';
import { admitTicket, listCheckIns } from './checkin.service.js';
import { checkInBody, checkInEventId, checkInInput, checkInQuery } from './checkin.validation.js';
export function admit(config: TicketConfig | null): RequestHandler {
  return async (req, res) => {
    if (!req.is('application/json')) throw new ApiError(400, 'INVALID_CHECKIN_INPUT', 'Content-Type must be application/json.');
    const input = checkInInput(req.body, checkInBody);
    const checkIn = await admitTicket(req.auth!.user.id, checkInEventId(req.params.eventId), input.qrPayload, config!);
    res.json({ success: true, data: { checkIn, serverNow: new Date(Date.now()).toISOString() } });
  };
}
export const list: RequestHandler = async (req, res) => {
  const data = await listCheckIns(req.auth!.user.id, checkInEventId(req.params.eventId), checkInInput(req.query, checkInQuery));
  res.json({ success: true, data });
};
