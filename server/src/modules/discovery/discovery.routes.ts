import { Router, type ErrorRequestHandler } from 'express';
import mongoose from 'mongoose';
import { isDatabaseReady, requireDatabase } from '../../config/database.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../lib/api-error.js';
import * as controller from './discovery.controller.js';

const discoveryErrorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (error instanceof ApiError) { next(error); return; }
  if (error instanceof mongoose.mongo.MongoServerError && error.code === 50) {
    next(new ApiError(503, 'EVENT_QUERY_TIMEOUT', 'The event query took too long. Narrow the filters and retry.')); return;
  }
  const unavailable = !isDatabaseReady() || (error instanceof Error && [
    'MongoNetworkError', 'MongoNetworkTimeoutError', 'MongoServerSelectionError', 'MongooseServerSelectionError',
    'MongoNotConnectedError', 'MongoTopologyClosedError', 'MongoOperationTimeoutError'
  ].includes(error.name));
  if (env.LOG_LEVEL !== 'silent') console.error(JSON.stringify({ level: 'error', requestId: res.locals.requestId, message: 'Event discovery failed.' }));
  next(new ApiError(unavailable ? 503 : 500, unavailable ? 'DATABASE_UNAVAILABLE' : 'INTERNAL_ERROR',
    unavailable ? 'The database is temporarily unavailable.' : 'An unexpected error occurred.'));
};

export function createDiscoveryRouter() {
  const router = Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.get('/', requireDatabase, controller.list);
  router.get('/:id', requireDatabase, controller.get);
  router.use(discoveryErrorHandler);
  return router;
}
