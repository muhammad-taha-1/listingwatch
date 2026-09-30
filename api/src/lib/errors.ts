import type { ErrorRequestHandler, RequestHandler } from 'express';
import { z } from 'zod';

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(404, 'NOT_FOUND', message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Missing or invalid admin token') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, 'CONFLICT', message);
  }
}

export class ValidationError extends AppError {
  constructor(details: unknown, message = 'Request validation failed') {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

/** Turn a ZodError into a compact list of { path, message }. */
export function formatZodIssues(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
};

/**
 * Central error middleware. Express 5 forwards rejected promises from async
 * handlers here automatically, so routes don't need an asyncHandler wrapper.
 */
export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  const requestId = req.id;

  if (err instanceof AppError) {
    if (err.status >= 500) req.log.error({ err }, 'request failed');
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details, requestId },
    });
    return;
  }

  // Errors from express.json() / express.text()
  const bodyErrorType = getBodyParserErrorType(err);
  if (bodyErrorType === 'entity.too.large') {
    res.status(413).json({
      error: { code: 'BODY_TOO_LARGE', message: 'Request body is too large', requestId },
    });
    return;
  }
  if (bodyErrorType === 'entity.parse.failed') {
    res.status(400).json({
      error: { code: 'INVALID_BODY', message: 'Request body could not be parsed', requestId },
    });
    return;
  }

  req.log.error({ err }, 'unhandled error');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong', requestId },
  });
};

function getBodyParserErrorType(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'type' in err && typeof err.type === 'string') {
    return err.type;
  }
  return undefined;
}
