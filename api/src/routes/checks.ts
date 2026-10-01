import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../lib/auth.js';
import { NotFoundError } from '../lib/errors.js';
import { objectIdParams, parse } from '../lib/validate.js';
import { CheckResult } from '../models/CheckResult.js';
import { CheckRun } from '../models/CheckRun.js';
import { Restaurant } from '../models/Restaurant.js';
import { createRun, dispatchRun } from '../services/checkRunner.js';

const runIdParamsSchema = objectIdParams('run');

const runsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(14),
});

export function checksRouter(adminToken: string) {
  const router = Router();
  const admin = requireAdmin(adminToken);

  // Starts a run and returns immediately: a full run can take longer than API
  // Gateway's 30s limit. Clients poll GET /checks/runs/:id until it finishes.
  router.post('/run', admin, async (req, res) => {
    const run = await createRun('manual');
    req.log.info({ runId: run.id }, 'manual check run requested');
    dispatchRun(run._id);
    res.status(202).location(`/checks/runs/${run.id}`).json({ runId: run.id, status: run.status });
  });

  router.get('/runs', async (req, res) => {
    const { limit } = parse(runsQuerySchema, req.query);
    const items = await CheckRun.find().sort({ startedAt: -1 }).limit(limit);
    res.json({ items });
  });

  router.get('/runs/:id', async (req, res) => {
    const { id } = parse(runIdParamsSchema, req.params);
    const run = await CheckRun.findById(id);
    if (!run) throw new NotFoundError('Check run not found');
    res.json(run);
  });

  // The most recent completed run, with each result and its restaurant.
  router.get('/latest', async (_req, res) => {
    const run = await CheckRun.findOne({ status: 'completed' }).sort({ startedAt: -1 });
    if (!run) {
      res.json({ run: null, results: [] });
      return;
    }

    const results = await CheckResult.find({ runId: run._id }).sort({ checkedAt: 1 });
    const restaurants = await Restaurant.find(
      { _id: { $in: results.map((r) => r.restaurantId) } },
      { name: 1, city: 1, expectedOrderUrl: 1 },
    );
    const byId = new Map(restaurants.map((r) => [r.id, r]));

    res.json({
      run,
      results: results.map((result) => ({
        ...result.toJSON(),
        // null if the restaurant was deleted after the run.
        restaurant: byId.get(String(result.restaurantId)) ?? null,
      })),
    });
  });

  return router;
}
