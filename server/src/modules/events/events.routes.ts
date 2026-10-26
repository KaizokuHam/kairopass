import { Router, type ErrorRequestHandler } from 'express';
import mongoose from 'mongoose';
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
  if (error instanceof mongoose.mongo.MongoServerError && error.code === 50) {
    next(new ApiError(503, 'EVENT_QUERY_TIMEOUT', 'The event query took too long. Narrow the filters and retry.')); return;
  }
  if (error instanceof mongoose.mongo.MongoServerError && error.code === 112) {
    next(new ApiError(409, 'EVENT_UPDATE_CONFLICT', 'The event changed. Reload it before trying again.')); return;
  }
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
  router.get('/', controller.list);
  router.get('/:id', controller.get);
  router.patch('/:id', controller.update);
  router.post('/:id/publish', controller.publish);
  router.post('/:id/cancel', controller.cancel);
  router.use(eventsErrorHandler);
  return router;
}
