import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Restaurant } from '../src/models/Restaurant.js';
import { authHeader, useTestApp } from './helpers.js';
import { useScenarioServer } from './testServer.js';

const app = useTestApp();
const url = useScenarioServer();

async function seed() {
  return Restaurant.insertMany([
    { name: 'Ok Diner', city: 'Dublin', expectedOrderUrl: url('/ok') },
    { name: 'Gone Grill', city: 'Cork', expectedOrderUrl: url('/missing') },
    { name: 'Away Cafe', city: 'Galway', expectedOrderUrl: url('/redirect-away') },
  ]);
}

/** Start a run through the API and poll until it is no longer "running". */
async function runToCompletion() {
  const start = await request(app()).post('/checks/run').set(authHeader);
  expect(start.status).toBe(202);
  const runId = start.body.runId as string;

  for (let attempt = 0; attempt < 50; attempt++) {
    const res = await request(app()).get(`/checks/runs/${runId}`);
    if (res.body.status !== 'running') return { start, finished: res };
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('run did not finish');
}

describe('POST /checks/run', () => {
  it('requires the admin token', async () => {
    const res = await request(app()).post('/checks/run');
    expect(res.status).toBe(401);
  });

  it('returns 202 with a runId straight away, then the run completes', async () => {
    await seed();
    const { start, finished } = await runToCompletion();
    expect(start.body).toEqual({ runId: expect.any(String), status: 'running' });
    expect(start.headers.location).toBe(`/checks/runs/${start.body.runId}`);

    expect(finished.body).toMatchObject({
      id: start.body.runId,
      trigger: 'manual',
      status: 'completed',
      restaurantCount: 3,
      totals: { ok: 1, broken: 1, wrong_destination: 1, timeout: 0, crashed: 0 },
    });
  });
});

describe('GET /checks/runs/:id', () => {
  it('returns 404 for an unknown run and 400 for a malformed id', async () => {
    expect((await request(app()).get('/checks/runs/0123456789abcdef01234567')).status).toBe(404);
    expect((await request(app()).get('/checks/runs/nope')).status).toBe(400);
  });
});

describe('GET /checks/runs', () => {
  it('lists runs newest first and validates limit', async () => {
    await runToCompletion();
    await runToCompletion();

    const res = await request(app()).get('/checks/runs?limit=1');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);

    const all = await request(app()).get('/checks/runs');
    const started = all.body.items.map((r: { startedAt: string }) => r.startedAt);
    expect(started).toEqual([...started].sort().reverse());

    expect((await request(app()).get('/checks/runs?limit=500')).status).toBe(400);
  });
});

describe('GET /checks/latest', () => {
  it('returns nulls before any run', async () => {
    const res = await request(app()).get('/checks/latest');
    expect(res.body).toEqual({ run: null, results: [] });
  });

  it('returns the latest completed run with restaurant details', async () => {
    await seed();
    const { finished } = await runToCompletion();

    const res = await request(app()).get('/checks/latest');
    expect(res.status).toBe(200);
    expect(res.body.run.id).toBe(finished.body.id);
    expect(res.body.results).toHaveLength(3);

    const gone = res.body.results.find(
      (r: { restaurant: { name: string } }) => r.restaurant.name === 'Gone Grill',
    );
    expect(gone).toMatchObject({
      result: 'broken',
      statusCode: 404,
      error: 'HTTP 404',
      restaurant: { name: 'Gone Grill', city: 'Cork', id: expect.any(String) },
    });
    expect(gone).not.toHaveProperty('_id');
  });
});

describe('GET /restaurants/:id/history', () => {
  it('returns check results for one restaurant, newest first', async () => {
    const [okDiner] = await seed();
    await runToCompletion();
    await runToCompletion();

    const res = await request(app()).get(`/restaurants/${okDiner?.id}/history?limit=5`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items.every((r: { result: string }) => r.result === 'ok')).toBe(true);
    const checkedAt = res.body.items.map((r: { checkedAt: string }) => r.checkedAt);
    expect(checkedAt).toEqual([...checkedAt].sort().reverse());
  });

  it('returns 404 for an unknown restaurant', async () => {
    const res = await request(app()).get('/restaurants/0123456789abcdef01234567/history');
    expect(res.status).toBe(404);
  });
});
