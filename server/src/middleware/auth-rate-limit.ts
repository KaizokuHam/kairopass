import { rateLimit } from 'express-rate-limit';
import { ApiError } from '../lib/api-error.js';

/** One fresh in-memory store per limiter/app; count successful and failed requests. */
export function authRateLimit(limit: number) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // Forwarding headers are deliberately ignored while trust proxy is false.
    validate: { xForwardedForHeader: false, forwardedHeader: false },
    handler: (_req, _res, next) => {
      next(new ApiError(429, 'RATE_LIMITED', 'Too many authentication attempts. Please try again later.'));
    }
  });
}
