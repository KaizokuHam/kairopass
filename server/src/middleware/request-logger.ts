import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { RequestHandler } from 'express';

/** Only source-defined templates belong here; baseUrl/path contain untrusted values. */
export function requestRouteScope(template: string): RequestHandler {
  return (_req, res, next) => { res.locals.requestRouteScope = template; next(); };
}

export function requestLogger(silent: boolean): RequestHandler {
  return (req, res, next) => {
    const requestId = randomUUID();
    const started = performance.now();
    res.locals.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    if (!silent) {
      res.once('finish', () => {
        console.info(JSON.stringify({
          level: 'info',
          time: new Date().toISOString(),
          requestId,
          method: req.method,
          path: `${res.locals.requestRouteScope ?? ''}${typeof req.route?.path === 'string' ? req.route.path.replace(/\/$/, '') : ''}` || 'unmatched',
          status: res.statusCode,
          durationMs: Math.round((performance.now() - started) * 100) / 100
        }));
      });
    }
    next();
  };
}
