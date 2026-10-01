import { describe, expect, it, vi } from 'vitest';
import { CheckResult } from '../src/models/CheckResult.js';
import { CheckRun } from '../src/models/CheckRun.js';
import { Restaurant } from '../src/models/Restaurant.js';
import { createRun, executeRun } from '../src/services/checkRunner.js';
import { useTestApp } from './helpers.js';
import { useScenarioServer } from './testServer.js';

useTestApp();
const url = useScenarioServer();

async function seed(paths: Record<string, string>) {
  return Restaurant.insertMany(
    Object.entries(paths).map(([name, path]) => ({
      name,
      city: 'Dublin',
      expectedOrderUrl: url(path),
    })),
  );
}

describe('executeRun', () => {
  it('checks every restaurant, stores results and totals', async () => {
    const [okOne] = await seed({
      Ok: '/ok',
      Redirect: '/redirect-same',
      Away: '/redirect-away',
      Missing: '/missing',
      Slow: '/slow',
    });

    const run = await createRun('manual');
    expect(run.status).toBe('running');

    const finished = await executeRun(run._id, { timeoutMs: 300, concurrency: 2 });

    expect(finished).toMatchObject({
      status: 'completed',
      restaurantCount: 5,
      totals: { ok: 2, broken: 1, wrong_destination: 1, timeout: 1, crashed: 0 },
    });
    expect(finished?.finishedAt).toBeInstanceOf(Date);

    const results = await CheckResult.find({ runId: run._id }).lean();
    expect(results).toHaveLength(5);

    const ok = results.find((r) => String(r.restaurantId) === String(okOne?._id));
    expect(ok).toMatchObject({ result: 'ok', statusCode: 200, finalUrl: url('/ok') });

    const timedOut = results.find((r) => r.result === 'timeout');
    expect(timedOut).toMatchObject({ error: 'Timed out' });
    expect(timedOut).not.toHaveProperty('statusCode');
  });

  it('completes an empty run when there are no restaurants', async () => {
    const run = await createRun('schedule');
    const finished = await executeRun(run._id);
    expect(finished).toMatchObject({ status: 'completed', restaurantCount: 0 });
  });

  it('marks the run failed and rethrows when the run cannot proceed', async () => {
    const run = await createRun('manual');
    const spy = vi.spyOn(Restaurant, 'find').mockImplementationOnce(() => {
      throw new Error('database unavailable');
    });
    await expect(executeRun(run._id)).rejects.toThrow('database unavailable');
    spy.mockRestore();
    const stored = await CheckRun.findById(run._id).lean();
    expect(stored).toMatchObject({ status: 'failed', finishedAt: expect.any(Date) });
  });
});
