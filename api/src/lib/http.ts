import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { pinoHttp } from 'pino-http';
import { logger } from './logger.js';

// `=` is allowed because API Gateway request ids end in it (e.g. "dYUDXhPdIAMEbHA="),
// and on Lambda serverless-http passes that id in as x-request-id.
const REQUEST_ID_PATTERN = /^[\w=-]{1,100}$/;

/**
 * Gives every request an id (reusing a well-formed incoming x-request-id) and a
 * req.log child logger whose lines all carry { requestId }. Logs one line per
 * completed request.
 */
export const requestLogger = pinoHttp({
  logger,
  quietReqLogger: true,
  customAttributeKeys: { reqId: 'requestId' },
  genReqId(req, res) {
    const incoming = req.headers['x-request-id'];
    const id =
      typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
    res.setHeader('x-request-id', id);
    return id;
  },
  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
});

/** Minimal CORS for the dashboard. A single allowed origin from config. */
export function cors(allowedOrigin: string): RequestHandler {
  return (req, res, next) => {
    if (req.get('origin') === allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Request-Id');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id');
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  };
}
