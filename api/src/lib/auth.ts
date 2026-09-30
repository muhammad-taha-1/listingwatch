import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { UnauthorizedError } from './errors.js';

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/**
 * Protects write routes with a shared bearer token (ADMIN_TOKEN).
 * Hashing both sides gives equal-length buffers, so timingSafeEqual
 * doesn't leak the token length or content through response timing.
 */
export function requireAdmin(adminToken: string): RequestHandler {
  const expected = sha256(adminToken);
  return (req, _res, next) => {
    const header = req.get('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token || !timingSafeEqual(sha256(token), expected)) {
      next(new UnauthorizedError());
      return;
    }
    next();
  };
}
