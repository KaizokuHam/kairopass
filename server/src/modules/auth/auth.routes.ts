import { Router, type ErrorRequestHandler, type RequestHandler } from 'express';
import type { AuthConfig } from '../../config/auth.js';
import { env } from '../../config/env.js';
import { isDatabaseReady, requireDatabase } from '../../config/database.js';
import { requireAuth } from '../../middleware/authenticate.js';
import { requireTrustedOrigin } from '../../middleware/auth-csrf.js';
import { authRateLimit } from '../../middleware/auth-rate-limit.js';
import { ApiError } from '../../lib/api-error.js';
import { authController } from './auth.controller.js';

const authErrorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (error instanceof ApiError) { next(error); return; }
  const unavailable = !isDatabaseReady() || (error instanceof Error && [
    'MongoNetworkError', 'MongoNetworkTimeoutError', 'MongoServerSelectionError',
    'MongooseServerSelectionError', 'MongoNotConnectedError', 'MongoTopologyClosedError', 'MongoOperationTimeoutError'
  ].includes(error.name));
  if (env.LOG_LEVEL !== 'silent') {
    console.error(JSON.stringify({ level: 'error', requestId: res.locals.requestId, message: 'Authentication operation failed.' }));
  }
  // Never forward raw database/hash-library errors to logs or JSON.
  next(new ApiError(unavailable ? 503 : 500,
    unavailable ? 'DATABASE_UNAVAILABLE' : 'INTERNAL_ERROR',
    unavailable ? 'The database is temporarily unavailable.' : 'An unexpected error occurred.'));
};

export function createAuthRouter(config: AuthConfig | null) {
  const router = Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  if (!config) {
    const unavailable: RequestHandler = (_req, _res, next) => next(new ApiError(503, 'AUTH_UNAVAILABLE', 'Authentication is not configured.'));
    router.post('/register', unavailable).post('/login', unavailable).get('/me', unavailable).post('/logout', unavailable);
    return router;
  }
  const controller = authController(config);
  router.use(requireTrustedOrigin(config));
  router.post('/register', authRateLimit(config.registerLimit), requireDatabase, controller.register);
  router.post('/login', authRateLimit(config.loginLimit), requireDatabase, controller.login);
  router.get('/me', requireDatabase, requireAuth(config), controller.me);
  router.post('/logout', requireDatabase, controller.logout);
  router.use(authErrorHandler);
  return router;
}
