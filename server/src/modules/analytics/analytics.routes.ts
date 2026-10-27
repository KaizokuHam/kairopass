import { Router, type ErrorRequestHandler } from 'express';
import type { AuthConfig } from '../../config/auth.js';
import { requireDatabase } from '../../config/database.js';
import { requireAuth } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/authorize.js';
import { ApiError } from '../../lib/api-error.js';
import { report } from './analytics.controller.js';
const errors: ErrorRequestHandler = (error: unknown, _req, _res, next) => {
  next(error instanceof ApiError ? error : new ApiError(503, 'ANALYTICS_UNAVAILABLE', 'Analytics could not be loaded. Narrow the report or retry.'));
};
export function createAnalyticsRouter(auth: AuthConfig | null, event = false) {
  const router = Router({ mergeParams: true });
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  if (!auth) { router.use((_req, _res, next) => next(new ApiError(503, 'AUTH_UNAVAILABLE', 'Authentication is not configured.'))); return router; }
  router.use(requireDatabase, requireAuth(auth), requireRole('ORGANIZER'));
  if (event) router.get('/', report);
  else { router.get('/overview', report); router.get('/trends', report); router.get('/events', report); }
  router.use(errors); return router;
}
