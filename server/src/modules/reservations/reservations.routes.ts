import { Router, type ErrorRequestHandler } from 'express';
import mongoose from 'mongoose';
import type { AuthConfig } from '../../config/auth.js';
import { env } from '../../config/env.js';
import { isDatabaseReady, requireDatabase } from '../../config/database.js';
import { requireAuth } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/authorize.js';
import { requireTrustedOrigin } from '../../middleware/auth-csrf.js';
import { ApiError } from '../../lib/api-error.js';
import * as controller from './reservations.controller.js';

const reservationErrorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (error instanceof ApiError) {
    if (error.code === 'INVENTORY_INCONSISTENT' && env.LOG_LEVEL !== 'silent') console.error(JSON.stringify({ level: 'error', requestId: res.locals.requestId, message: 'Reservation inventory invariant failed.' }));
    next(error); return;
  }
  const unavailable = !isDatabaseReady() || (error instanceof mongoose.mongo.MongoServerError && [50, 112, 251].includes(Number(error.code))) ||
    (error instanceof Error && /Mongo.*(Network|Selection|NotConnected|TopologyClosed|Timeout)/.test(error.name));
  if (env.LOG_LEVEL !== 'silent') console.error(JSON.stringify({ level: 'error', requestId: res.locals.requestId, message: 'Reservation operation failed.' }));
  next(new ApiError(unavailable ? 503 : 500, unavailable ? 'DATABASE_UNAVAILABLE' : 'INTERNAL_ERROR',
    unavailable ? 'Reservation service is temporarily unavailable. Check My Reservations before retrying a submitted operation.' : 'An unexpected error occurred.'));
};
export function createReservationsRouter(config: AuthConfig | null) {
  const router = Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  if (!config) {
    router.use((_req, _res, next) => next(new ApiError(503, 'AUTH_UNAVAILABLE', 'Authentication is not configured.')));
    return router;
  }
  router.use(requireDatabase, requireAuth(config), requireRole('ATTENDEE'), requireTrustedOrigin(config));
  router.post('/', controller.create);
  router.get('/', controller.list);
  router.get('/:id', controller.get);
  router.post('/:id/cancel', controller.cancel);
  router.use(reservationErrorHandler);
  return router;
}
