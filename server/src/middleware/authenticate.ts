import type { RequestHandler } from 'express';
import type { AuthConfig } from '../config/auth.js';
import { authenticate } from '../modules/auth/auth.service.js';
import { readSessionCookie } from '../modules/auth/auth.tokens.js';

export function requireAuth(config: AuthConfig): RequestHandler {
  return async (req, _res, next) => {
    req.auth = await authenticate(readSessionCookie(req.headers.cookie), config);
    next();
  };
}
