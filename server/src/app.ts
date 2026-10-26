import { existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { checkDatabaseReadiness } from './config/database.js';
import { ApiError } from './lib/api-error.js';
import { apiNotFound, errorHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { parseAuthEnvironment, type AuthConfig } from './config/auth.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createEventsRouter } from './modules/events/events.routes.js';
import { createDiscoveryRouter } from './modules/discovery/discovery.routes.js';
import { createReservationsRouter } from './modules/reservations/reservations.routes.js';
import { createPaymentsRouter } from './modules/payments/payments.routes.js';
import { parseTicketEnvironment, type TicketConfig } from './modules/tickets/tickets.crypto.js';
import { createTicketIssuanceRouter, createTicketsRouter } from './modules/tickets/tickets.routes.js';
import { createCheckInRouter } from './modules/checkin/checkin.routes.js';

interface AppOptions {
  mode?: 'development' | 'test' | 'production';
  clientOrigin?: string;
  clientDistPath?: string;
  logLevel?: 'info' | 'silent';
  authEnvironment?: NodeJS.ProcessEnv;
  ticketEnvironment?: NodeJS.ProcessEnv;
}

export function createApp(options: AppOptions = {}) {
  const mode = options.mode ?? env.NODE_ENV;
  const silent = (options.logLevel ?? env.LOG_LEVEL) === 'silent';
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use(requestLogger(silent));
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  // Reject malformed percent/UTF-8 escapes before router/static decoders can
  // misclassify URIError as an auth/database/internal failure.
  app.use((req, _res, next) => {
    try { decodeURI(req.path); next(); }
    catch { next(new ApiError(400, 'INVALID_URL', 'The request URL is not correctly encoded.')); }
  });
  if (mode === 'development') {
    app.use(cors({ origin: options.clientOrigin ?? env.CLIENT_ORIGIN, credentials: true }));
  }
  app.use(express.json({ limit: '32kb' }));

  app.get('/api/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, message: 'KairoPass API is running' });
  });
  app.get('/api/ready', async (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!await checkDatabaseReadiness()) {
      next(new ApiError(503, 'DATABASE_UNAVAILABLE', 'The database is temporarily unavailable.'));
      return;
    }
    res.json({ success: true, message: 'KairoPass database is ready' });
  });
  let authConfig: AuthConfig | null;
  try {
    authConfig = parseAuthEnvironment({
      ...(options.authEnvironment ?? process.env),
      ...(options.clientOrigin ? { CLIENT_ORIGIN: options.clientOrigin } : {})
    }, mode);
  } catch {
    authConfig = null; // Fail closed for auth while preserving independent liveness.
  }
  let ticketConfig: TicketConfig | null;
  try { ticketConfig = parseTicketEnvironment({ ...(options.authEnvironment ?? process.env), TICKET_HMAC_SECRET: (options.ticketEnvironment ?? options.authEnvironment ?? process.env).TICKET_HMAC_SECRET }); }
  catch { ticketConfig = null; }
  app.use('/api/auth', createAuthRouter(authConfig));
  app.use('/api/organizer/events/:eventId/check-ins', createCheckInRouter(authConfig, ticketConfig));
  app.use('/api/organizer/events', createEventsRouter(authConfig));
  app.use('/api/events', createDiscoveryRouter());
  app.use('/api/reservations/:id/ticket', createTicketIssuanceRouter(authConfig, ticketConfig));
  app.use('/api/tickets', createTicketsRouter(authConfig, ticketConfig));
  app.use('/api/reservations/:id/payments', createPaymentsRouter(authConfig));
  app.use('/api/reservations', createReservationsRouter(authConfig));
  // Match the /api path boundary, including /api itself, before any SPA routes.
  app.use('/api', apiNotFound);

  if (mode === 'production') {
    const clientDistPath = options.clientDistPath ?? fileURLToPath(new URL('../../client/dist/', import.meta.url));
    const entryPoint = join(clientDistPath, 'index.html');
    if (!existsSync(entryPoint)) {
      throw new Error('Frontend build missing. Run npm run build before starting production.');
    }
    app.use(express.static(clientDistPath, { index: false, dotfiles: 'deny' }));
    app.use((req, res, next) => {
      // Only browser navigations get the SPA. Missing assets and other methods stay 404.
      const isAssetPath = req.path === '/assets' || req.path.startsWith('/assets/');
      if (['GET', 'HEAD'].includes(req.method) && req.accepts('html') && !extname(req.path) && !isAssetPath) {
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(entryPoint);
        return;
      }
      next();
    });
  }

  app.use((_req, _res, next) => {
    next(new ApiError(404, 'NOT_FOUND', 'The requested resource does not exist.'));
  });
  app.use(errorHandler(silent));
  return app;
}
