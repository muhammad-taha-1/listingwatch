import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { useTestApp } from './helpers.js';

const app = useTestApp();

describe('GET /health', () => {
  it('reports ok when the database is reachable', async () => {
    const res = await request(app()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'up' });
  });

  it('sets an x-request-id header, reusing a valid incoming one', async () => {
    const generated = await request(app()).get('/health');
    expect(generated.headers['x-request-id']).toMatch(/^[\w-]+$/);

    const reused = await request(app()).get('/health').set('x-request-id', 'abc-123');
    expect(reused.headers['x-request-id']).toBe('abc-123');
  });
});

describe('unknown routes', () => {
  it('return a 404 in the standard error shape', async () => {
    const res = await request(app()).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND' });
    expect(res.body.error.requestId).toBeTypeOf('string');
  });
});
