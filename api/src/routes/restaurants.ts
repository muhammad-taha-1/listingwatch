import express, { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../lib/auth.js';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';
import { encodeCursor, paginationQuerySchema } from '../lib/pagination.js';
import { objectIdParams, parse } from '../lib/validate.js';
import { AiReview } from '../models/AiReview.js';
import { CheckResult } from '../models/CheckResult.js';
import { Restaurant, restaurantInputSchema, restaurantPatchSchema } from '../models/Restaurant.js';
import type { AiReviewer } from '../services/aiReviewer.js';
import { importRestaurantCsv } from '../services/importer.js';

const idParamsSchema = objectIdParams('restaurant');

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export function restaurantsRouter(adminToken: string, aiReviewer: AiReviewer) {
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

  // Link check results for one restaurant, newest first (uses the
  // { restaurantId: 1, checkedAt: -1 } index).
  router.get('/:id/history', async (req, res) => {
    const { id } = parse(idParamsSchema, req.params);
    const { limit } = parse(listQuerySchema, req.query);
    const exists = await Restaurant.exists({ _id: id });
    if (!exists) throw new NotFoundError('Restaurant not found');
    const items = await CheckResult.find({ restaurantId: id }).sort({ checkedAt: -1 }).limit(limit);
    res.json({ items });
  });

  // Ask the LLM to review the listing description, then store the review.
  // Admin-only because every call costs money.
  router.post('/:id/review', admin, async (req, res) => {
    const { id } = parse(idParamsSchema, req.params);
    const restaurant = await Restaurant.findById(id);
    if (!restaurant) throw new NotFoundError('Restaurant not found');
    const { name, city, description } = restaurant;
    if (description.trim() === '') {
      throw new ValidationError(undefined, 'This restaurant has no description to review');
    }

    const result = await aiReviewer.review({ name, city, description }, req.log);
    const review = await AiReview.create({
      restaurantId: restaurant._id,
      reviewedDescription: description,
      score: result.score,
      issues: result.issues,
      suggestedDescription: result.suggestedDescription,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd,
    });
    res.status(201).json(review);
  });

  // AI reviews for one restaurant, newest first. _id breaks ties between
  // reviews saved in the same millisecond (index { restaurantId, createdAt, _id }).
  router.get('/:id/reviews', async (req, res) => {
    const { id } = parse(idParamsSchema, req.params);
    const { limit } = parse(listQuerySchema, req.query);
    const exists = await Restaurant.exists({ _id: id });
    if (!exists) throw new NotFoundError('Restaurant not found');
    const items = await AiReview.find({ restaurantId: id }).sort({ createdAt: -1, _id: -1 }).limit(limit);
    res.json({ items });
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
