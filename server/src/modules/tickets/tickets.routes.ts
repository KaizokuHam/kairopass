import { Router, type ErrorRequestHandler } from 'express';
import type { AuthConfig } from '../../config/auth.js';
import { requireDatabase } from '../../config/database.js';
import { requireAuth } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/authorize.js';
import { requireTrustedOrigin } from '../../middleware/auth-csrf.js';
import { ApiError } from '../../lib/api-error.js';
import { env } from '../../config/env.js';
import type { TicketConfig } from './tickets.crypto.js';
import * as controller from './tickets.controller.js';

const errors: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (error instanceof ApiError) { next(error); return; }
  if (env.LOG_LEVEL !== 'silent') console.error(JSON.stringify({ level: 'error', requestId: res.locals.requestId, message: 'Ticket operation could not be verified.' }));
  next(new ApiError(503, 'TICKET_UNAVAILABLE', 'Ticket issuance could not be verified. Check My Tickets before retrying.'));
};
function guarded(auth: AuthConfig | null, config: TicketConfig | null) {
  const router = Router({ mergeParams: true });
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  if (!auth) { router.use((_req, _res, next) => next(new ApiError(503, 'AUTH_UNAVAILABLE', 'Authentication is not configured.'))); return router; }
  router.use(requireDatabase, requireAuth(auth), requireRole('ATTENDEE'), requireTrustedOrigin(auth));
  if (!config) router.use((_req, _res, next) => next(new ApiError(503, 'TICKET_CONFIGURATION_UNAVAILABLE', 'Ticket signing is temporarily unavailable. Your confirmed reservation is preserved.')));
  return router;
}
export function createTicketIssuanceRouter(auth: AuthConfig | null, config: TicketConfig | null) {
  const router = guarded(auth, config);
  router.post('/', controller.issue(config));
  router.use(errors); return router;
}
export function createTicketsRouter(auth: AuthConfig | null, config: TicketConfig | null) {
  const router = guarded(auth, config);
  router.get('/', controller.list);
  router.get('/:id', controller.get(config));
  router.use(errors); return router;
}
