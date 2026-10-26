import type { RequestHandler } from 'express';
import { ApiError } from '../../lib/api-error.js';
import { reservationId } from '../reservations/reservations.validation.js';
import type { TicketConfig } from './tickets.crypto.js';
import * as service from './tickets.service.js';
import { ticketBodySchema, ticketId, ticketInput, ticketListSchema } from './tickets.validation.js';
export function issue(config: TicketConfig | null): RequestHandler {
  return async (req, res) => {
    if (req.body !== undefined || (req.get('content-length') && req.get('content-length') !== '0') || req.get('transfer-encoding')) {
      if (!req.is('application/json')) throw new ApiError(400, 'TICKET_INVALID_INPUT', 'Content-Type must be application/json.');
      ticketInput(req.body, ticketBodySchema);
    }
    const data = await service.issueTicket(req.auth!.user.id, reservationId(req.params.id), config!);
    res.status(data.created ? 201 : 200).json({ success: true, data: { ...data, serverNow: new Date(Date.now()).toISOString() } });
  };
}
export const list: RequestHandler = async (req, res) => {
  const data = await service.listTickets(req.auth!.user.id, ticketInput(req.query, ticketListSchema));
  res.json({ success: true, data: { ...data, serverNow: new Date(Date.now()).toISOString() } });
};
export function get(config: TicketConfig | null): RequestHandler {
  return async (req, res) => {
    const ticket = await service.getTicket(req.auth!.user.id, ticketId(req.params.id), config!);
    res.json({ success: true, data: { ticket, serverNow: new Date(Date.now()).toISOString() } });
  };
}
