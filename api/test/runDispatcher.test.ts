import { Types } from 'mongoose';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { CheckRun } from '../src/models/CheckRun.js';
import {
  createRunDispatcher,
  dispatchInProcess,
  dispatchToLambda,
  type InvokeAsync,
  type RunDispatcher,
} from '../src/services/runDispatcher.js';
import { authHeader, useTestApp } from './helpers.js';

describe('dispatchToLambda', () => {
  it('sends the runId to the checker function', async () => {
    const invoke = vi.fn<InvokeAsync>(async () => undefined);
    const runId = new Types.ObjectId();

    await dispatchToLambda('listingwatch-CheckerFunction', invoke)(runId);

    expect(invoke).toHaveBeenCalledWith('listingwatch-CheckerFunction', { runId: String(runId) });
  });
});

describe('createRunDispatcher', () => {
  it('runs in-process when no checker function is configured (local dev)', () => {
    expect(createRunDispatcher(undefined)).toBe(dispatchInProcess);
  });
});

// The API with a fake dispatcher, as on Lambda but without calling AWS.
const dispatchRun = vi.fn<RunDispatcher>();
const app = useTestApp({ dispatchRun });

describe('POST /checks/run with a dispatcher', () => {
  it('returns 202 once the run has been handed off', async () => {
    dispatchRun.mockResolvedValueOnce(undefined);

    const res = await request(app()).post('/checks/run').set(authHeader);

    expect(res.status).toBe(202);
    expect(dispatchRun).toHaveBeenCalledWith(new Types.ObjectId(res.body.runId as string));
    expect(await CheckRun.findById(res.body.runId).lean()).toMatchObject({ status: 'running' });
  });

  it('returns 503 and marks the run failed when the hand-off fails', async () => {
    dispatchRun.mockRejectedValueOnce(new Error('AccessDeniedException'));

    const res = await request(app()).post('/checks/run').set(authHeader);

    expect(res.status).toBe(503);
    expect(res.body.error).toMatchObject({ code: 'RUN_NOT_STARTED' });
    const runs = await CheckRun.find().lean();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: 'failed', finishedAt: expect.any(Date) });
  });
});
