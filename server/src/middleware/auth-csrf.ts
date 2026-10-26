import type { RequestHandler } from 'express';
import type { AuthConfig } from '../config/auth.js';
import { ApiError } from '../lib/api-error.js';

/** Includes login/register to prevent login CSRF. No trust in Host/Forwarded headers. */
export function requireTrustedOrigin(config: AuthConfig): RequestHandler {
  return (req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('Origin');
      if (!origin || !config.allowedOrigins.has(origin)) {
        next(new ApiError(403, 'UNTRUSTED_ORIGIN', 'A trusted Origin header is required for this request.'));
        return;
      }
    }
    next();
  };
}
