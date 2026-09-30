import express, { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import { z } from 'zod';
import { requireAdmin } from '../lib/auth.js';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';
import { encodeCursor, paginationQuerySchema } from '../lib/pagination.js';
import { parse } from '../lib/validate.js';
import { Restaurant, restaurantInputSchema, restaurantPatchSchema } from '../models/Restaurant.js';
import { importRestaurantCsv } from '../services/importer.js';

const idParamsSchema = z.object({
  id: z.string().refine((id) => isValidObjectId(id), 'Invalid restaurant id'),
});

export function restaurantsRouter(adminToken: string) {
  const router = Router();
  const admin = requireAdmin(adminToken);

  router.get('/', async (req, res) => {
    const { limit, cursor } = parse(paginationQuerySchema, req.query);

    // Fetch one extra to know whether another page exists.
    const docs = await Restaurant.find(cursor ? { _id: { $lt: cursor } } : {})
      .sort({ _id: -1 })
      .limit(limit + 1);

    const hasMore = docs.length > limit;
    const items = hasMore ? docs.slice(0, limit) : docs;
    const last = items.at(-1);

    res.json({ items, nextCursor: hasMore && last ? encodeCursor(last._id) : null });
  });

  router.post('/', admin, async (req, res) => {
    const input = parse(restaurantInputSchema, req.body);
    try {
      const restaurant = await Restaurant.create(input);
      res.status(201).location(`/restaurants/${restaurant.id}`).json(restaurant);
    } catch (err) {
      throw toConflict(err, input);
    }
  });

  // Body is raw CSV text (Content-Type: text/csv), e.g. from Postman's "raw" body
  // or `curl --data-binary @file.csv`.
  router.post(
    '/import',
    admin,
    express.text({ type: ['text/csv', 'text/plain'], limit: '1mb' }),
    async (req, res) => {
      if (typeof req.body !== 'string' || req.body.trim() === '') {
        throw new ValidationError(undefined, 'Send the CSV as the request body with Content-Type: text/csv');
      }
      const result = await importRestaurantCsv(req.body);
      req.log.info(
        { inserted: result.inserted, skipped: result.skipped, failed: result.failed },
        'restaurants imported',
      );
      res.json(result);
    },
  );

  router.get('/:id', async (req, res) => {
    const { id } = parse(idParamsSchema, req.params);
    const restaurant = await Restaurant.findById(id);
    if (!restaurant) throw new NotFoundError('Restaurant not found');
    res.json(restaurant);
  });

  router.patch('/:id', admin, async (req, res) => {
    const { id } = parse(idParamsSchema, req.params);
    const changes = parse(restaurantPatchSchema, req.body);
    try {
      const restaurant = await Restaurant.findByIdAndUpdate(id, changes, {
        returnDocument: 'after',
        runValidators: true,
      });
      if (!restaurant) throw new NotFoundError('Restaurant not found');
      res.json(restaurant);
    } catch (err) {
      throw toConflict(err, changes);
    }
  });

  router.delete('/:id', admin, async (req, res) => {
    const { id } = parse(idParamsSchema, req.params);
    const deleted = await Restaurant.findByIdAndDelete(id);
    if (!deleted) throw new NotFoundError('Restaurant not found');
    res.status(204).end();
  });

  return router;
}

export function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 11000;
}

function toConflict(err: unknown, input: { name?: string; city?: string }): unknown {
  if (!isDuplicateKeyError(err)) return err;
  const where = input.name && input.city ? `"${input.name}" in ${input.city}` : 'this name and city';
  return new ConflictError(`A restaurant already exists for ${where}`);
}
