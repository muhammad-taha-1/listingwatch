import { Types } from 'mongoose';
import { z } from 'zod';

/**
 * Cursor pagination over _id (descending = newest first).
 *
 * The cursor is the last _id of the previous page, base64url-encoded so
 * clients treat it as opaque. The next page is `_id < cursor`, which uses the
 * _id index directly: every page costs the same, unlike skip/offset where the
 * DB still walks all skipped documents, and inserts between requests don't
 * shift items across pages.
 */
export function encodeCursor(id: Types.ObjectId): string {
  return Buffer.from(id.toHexString()).toString('base64url');
}

export function decodeCursor(cursor: string): Types.ObjectId | undefined {
  const hex = Buffer.from(cursor, 'base64url').toString('utf8');
  return /^[0-9a-f]{24}$/.test(hex) ? new Types.ObjectId(hex) : undefined;
}

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined) return undefined;
      const id = decodeCursor(value);
      if (!id) {
        ctx.addIssue({ code: 'custom', message: 'Invalid cursor' });
        return z.NEVER;
      }
      return id;
    }),
});
