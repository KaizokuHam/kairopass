import { Router, type ErrorRequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import type { AuthConfig } from '../../config/auth.js';
import { requireDatabase, isDatabaseReady } from '../../config/database.js';
import { requireAuth } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/authorize.js';
import { requireTrustedOrigin } from '../../middleware/auth-csrf.js';
import { ApiError } from '../../lib/api-error.js';
import * as controller from './payments.controller.js';
const paymentErrors: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (error instanceof ApiError) {
    if (['PAYMENT_INCONSISTENT', 'INVENTORY_INCONSISTENT'].includes(error.code) && env.LOG_LEVEL !== 'silent') console.error(JSON.stringify({ level: 'error', requestId: res.locals.requestId, message: 'Simulated payment invariant failed.' }));
    next(error); return;
  }
  const unavailable = !isDatabaseReady() || (error instanceof mongoose.mongo.MongoServerError && [50, 112, 251].includes(Number(error.code))) ||
    (error instanceof Error && /Mongo.*(Network|Selection|NotConnected|TopologyClosed|Timeout)/.test(error.name));
  if (env.LOG_LEVEL !== 'silent') console.error(JSON.stringify({ level: 'error', requestId: res.locals.requestId, message: 'Simulated payment operation failed.' }));
  next(new ApiError(unavailable ? 503 : 500, unavailable ? 'DATABASE_UNAVAILABLE' : 'INTERNAL_ERROR', 'Payment processing could not be confirmed. Check its status before retrying with the same idempotency key.'));
};
export function createPaymentsRouter(config: AuthConfig | null) {
  const router = Router({ mergeParams: true });
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  if (!config) { router.use((_req, _res, next) => next(new ApiError(503, 'AUTH_UNAVAILABLE', 'Authentication is not configured.'))); return router; }
  router.use(requireDatabase, requireAuth(config), requireRole('ATTENDEE'), requireTrustedOrigin(config));
  const limit = rateLimit({ windowMs: 60000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false,
    keyGenerator: (req) => req.auth!.user.id,
    handler: (_req, res, next, options) => { res.setHeader('Retry-After', Math.ceil(options.windowMs / 1000)); next(new ApiError(429, 'RATE_LIMITED', 'Too many checkout requests. Check existing payment status and try again shortly.')); }
  });
  router.post('/', limit, controller.process);
  router.get('/', controller.list);
  router.get('/:paymentId', controller.get);
  router.use(paymentErrors);
  return router;
}
