import type { Context } from 'aws-lambda';
import { beforeAll, describe, expect, it } from 'vitest';
import { handler } from '../src/checker-job.js';
import { CheckResult } from '../src/models/CheckResult.js';
import { CheckRun } from '../src/models/CheckRun.js';
import { Restaurant } from '../src/models/Restaurant.js';
import { createRun } from '../src/services/checkRunner.js';
import { useTestApp } from './helpers.js';
import { useScenarioServer } from './testServer.js';

// useTestApp connects Mongo first; the handler's own connectDb() then reuses
// that connection, so this value only has to pass config validation.
useTestApp();
const url = useScenarioServer();
const context = { awsRequestId: 'test-invocation-id' } as Context;

beforeAll(() => {
  process.env.MONGODB_URI ??= 'mongodb://connected-by-test-helpers';
});

async function seedOne() {
  return Restaurant.create({ name: 'Ok Cafe', city: 'Dublin', expectedOrderUrl: url('/ok') });
}

describe('checker Lambda handler', () => {
  it('creates and completes a "schedule" run for the nightly event', async () => {
    await seedOne();

    const result = await handler({ trigger: 'schedule' }, context);

    expect(result).toMatchObject({ status: 'completed', totals: { ok: 1 } });
    const runs = await CheckRun.find().lean();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ trigger: 'schedule', status: 'completed', restaurantCount: 1 });
  });

  it('completes the manual run the API created', async () => {
    await seedOne();
    const run = await createRun('manual');

    const result = await handler({ runId: run.id }, context);

    expect(result).toMatchObject({ runId: run.id, status: 'completed' });
    expect(await CheckRun.countDocuments()).toBe(1);
    expect(await CheckResult.countDocuments({ runId: run._id })).toBe(1);
  });

  it('skips a run that already finished, so a repeated event adds no duplicates', async () => {
    await seedOne();
    const run = await createRun('manual');
    await handler({ runId: run.id }, context);

    const again = await handler({ runId: run.id }, context);

    expect(again).toEqual({ runId: run.id, skipped: true });
    expect(await CheckResult.countDocuments({ runId: run._id })).toBe(1);
  });

  it('rejects an event it does not understand', async () => {
    await expect(handler({ runId: 'not-an-id' }, context)).rejects.toThrow('Invalid checker event');
    await expect(handler({ hello: 'world' }, context)).rejects.toThrow('Invalid checker event');
    expect(await CheckRun.countDocuments()).toBe(0);
  });
});
