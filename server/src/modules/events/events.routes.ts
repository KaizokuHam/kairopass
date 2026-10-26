import { Router, type ErrorRequestHandler } from 'express';
import type { AuthConfig } from '../../config/auth.js';
import { env } from '../../config/env.js';
import { isDatabaseReady, requireDatabase } from '../../config/database.js';
import { requireAuth } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/authorize.js';
import { requireTrustedOrigin } from '../../middleware/auth-csrf.js';
import { ApiError } from '../../lib/api-error.js';
import * as controller from './events.controller.js';

const eventsErrorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (error instanceof ApiError) { next(error); return; }
  const unavailable = !isDatabaseReady() || (error instanceof Error && [
    'MongoNetworkError', 'MongoNetworkTimeoutError', 'MongoServerSelectionError',
    'MongooseServerSelectionError', 'MongoNotConnectedError', 'MongoTopologyClosedError', 'MongoOperationTimeoutError'
  ].includes(error.name));
  if (env.LOG_LEVEL !== 'silent') console.error(JSON.stringify({ level: 'error', requestId: res.locals.requestId, message: 'Event operation failed.' }));
  next(new ApiError(unavailable ? 503 : 500, unavailable ? 'DATABASE_UNAVAILABLE' : 'INTERNAL_ERROR',
    unavailable ? 'The database is temporarily unavailable.' : 'An unexpected error occurred.'));
};

export function createEventsRouter(config: AuthConfig | null) {
  const router = Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  if (!config) {
    router.use((_req, _res, next) => next(new ApiError(503, 'AUTH_UNAVAILABLE', 'Authentication is not configured.')));
    return router;
  }
  router.use(requireDatabase, requireAuth(config), requireRole('ORGANIZER'), requireTrustedOrigin(config));
  router.post('/', controller.create);
  router.use(eventsErrorHandler);
  return router;
}
