import type { RequestHandler, Response } from 'express';
import type { AuthConfig } from '../../config/auth.js';
import { ApiError } from '../../lib/api-error.js';
import * as service from './auth.service.js';
import { loginSchema, parseAuthBody, registrationSchema } from './auth.validation.js';
import { readSessionCookie, SESSION_COOKIE_NAME, sessionCookieOptions } from './auth.tokens.js';

function setSessionCookie(res: Response, token: string, expiresAt: Date, config: AuthConfig) {
  res.cookie(SESSION_COOKIE_NAME, token, {
    ...sessionCookieOptions(config), maxAge: Math.max(0, expiresAt.getTime() - Date.now())
  });
}

export function authController(config: AuthConfig): Record<'register' | 'login' | 'me' | 'logout', RequestHandler> {
  return {
    register: async (req, res) => {
      const result = await service.register(parseAuthBody(req, registrationSchema), config);
      setSessionCookie(res, result.token, result.expiresAt, config);
      res.status(201).json({ success: true, data: { user: result.user } });
    },
    login: async (req, res) => {
      const result = await service.login(parseAuthBody(req, loginSchema), config);
      setSessionCookie(res, result.token, result.expiresAt, config);
      res.json({ success: true, data: { user: result.user } });
    },
    me: (req, res) => {
      if (!req.auth) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication is required.');
      res.json({ success: true, data: { user: req.auth.user } });
    },
    logout: async (req, res) => {
      await service.logout(readSessionCookie(req.headers.cookie), config);
      res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions(config));
      res.json({ success: true, message: 'Logged out successfully.' });
    }
  };
}
