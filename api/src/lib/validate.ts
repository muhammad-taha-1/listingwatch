import { isValidObjectId } from 'mongoose';
import { z } from 'zod';
import { ValidationError, formatZodIssues } from './errors.js';

/** `{ id }` route params that must be a Mongo ObjectId, e.g. objectIdParams('restaurant'). */
export function objectIdParams(label: string) {
  return z.object({
    id: z.string().refine((id) => isValidObjectId(id), `Invalid ${label} id`),
  });
}

/**
 * Parse request input with a zod schema, or throw a 400 ValidationError.
 * Called at the top of each route handler so the handler works with typed data.
 * (Express 5 makes req.query read-only, so we return the parsed value instead of
 * overwriting req.)
 */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) throw new ValidationError(formatZodIssues(result.error));
  return result.data;
}
