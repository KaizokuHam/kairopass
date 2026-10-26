import { Router, type ErrorRequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { AuthConfig } from '../../config/auth.js';
import { env } from '../../config/env.js';
import { requireDatabase } from '../../config/database.js';
import { requireAuth } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/authorize.js';
import { requireTrustedOrigin } from '../../middleware/auth-csrf.js';
import { ApiError } from '../../lib/api-error.js';
import type { TicketConfig } from '../tickets/tickets.crypto.js';
import * as controller from './checkin.controller.js';
const errors: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (error instanceof ApiError) { next(error); return; }
  if (env.LOG_LEVEL !== 'silent') console.error(JSON.stringify({ level: 'error', requestId: res.locals.requestId, message: 'Check-in operation could not be confirmed.' }));
  next(new ApiError(503, 'CHECKIN_OUTCOME_UNKNOWN', 'Admission could not be confirmed. Check history or explicitly retry; do not assume approval.'));
};
export function createCheckInRouter(auth: AuthConfig | null, signing: TicketConfig | null) {
  const router = Router({ mergeParams: true });
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  if (!auth) { router.use((_req, _res, next) => next(new ApiError(503, 'AUTH_UNAVAILABLE', 'Authentication is not configured.'))); return router; }
  router.use(requireDatabase, requireAuth(auth), requireRole('ORGANIZER'), requireTrustedOrigin(auth));
  const limit = rateLimit({ windowMs: 60000, limit: 180, standardHeaders: 'draft-8', legacyHeaders: false,
    keyGenerator: (req) => req.auth!.user.id,
    handler: (_req, res, next, options) => { res.setHeader('Retry-After', Math.ceil(options.windowMs / 1000)); next(new ApiError(429, 'RATE_LIMITED', 'Too many admission requests. Check history and try again shortly.')); }
  });
  router.get('/', controller.list);
  router.post('/', limit, (_req, _res, next) => signing ? next() : next(new ApiError(503, 'CHECKIN_CONFIGURATION_UNAVAILABLE', 'Ticket verification is temporarily unavailable. Admission cannot be approved.')), controller.admit(signing));
  router.use(errors); return router;
}
