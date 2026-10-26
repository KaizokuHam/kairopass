import type { RequestHandler } from 'express';
import type { UserRecord } from '../models/User.model.js';
import { ApiError } from '../lib/api-error.js';

/** Roles come from requireAuth's fresh database lookup, never a role claim in a JWT. */
export function requireRole(...roles: UserRecord['role'][]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(new ApiError(401, 'UNAUTHENTICATED', 'Authentication is required.'));
      return;
    }
    if (!roles.includes(req.auth.user.role)) {
      next(new ApiError(403, 'FORBIDDEN', 'You do not have permission to access this resource.'));
      return;
    }
    next();
  };
}
