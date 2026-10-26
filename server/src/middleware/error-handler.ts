import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ApiError } from '../lib/api-error.js';

export const apiNotFound: RequestHandler = (_req, _res, next) => {
  next(new ApiError(404, 'API_NOT_FOUND', 'The requested API endpoint does not exist.'));
};

function isBodyParserError(error: unknown): error is { type: string } {
  return typeof error === 'object' && error !== null && 'type' in error && typeof error.type === 'string';
}

export function errorHandler(silent: boolean): ErrorRequestHandler {
  return (error: unknown, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    let failure = error instanceof ApiError ? error : undefined;
    if (isBodyParserError(error)) {
      if (error.type === 'entity.parse.failed') {
        failure = new ApiError(400, 'INVALID_JSON', 'Request body must contain valid JSON.');
      } else if (error.type === 'entity.too.large') {
        failure = new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds the 32 KB limit.');
      }
    }

    if (!failure && !silent) {
      console.error(JSON.stringify({
        level: 'error',
        requestId: res.locals.requestId,
        message: 'Unhandled request error',
        error: error instanceof Error ? error.message : 'Unknown error'
      }));
    }

    res.status(failure?.status ?? 500).json({
      success: false,
      error: {
        code: failure?.code ?? 'INTERNAL_ERROR',
        message: failure?.message ?? 'An unexpected error occurred.',
        requestId: res.locals.requestId,
        ...(failure?.details ? { details: failure.details } : {})
      }
    });
  };
}
