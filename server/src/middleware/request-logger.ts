import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { RequestHandler } from 'express';

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
          path: req.path,
          status: res.statusCode,
          durationMs: Math.round((performance.now() - started) * 100) / 100
        }));
      });
    }
    next();
  };
}
