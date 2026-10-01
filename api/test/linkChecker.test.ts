import { describe, expect, it } from 'vitest';
import { classify, probeUrl } from '../src/services/linkChecker.js';
import { closedPortUrl, useScenarioServer } from './testServer.js';

const url = useScenarioServer();
const TIMEOUT_MS = 300;

async function check(target: string) {
  const { probe, latencyMs } = await probeUrl(target, TIMEOUT_MS);
  return { probe, latencyMs, ...classify(target, probe) };
}

describe('probeUrl + classify', () => {
  it('is ok for a 200', async () => {
    const result = await check(url('/ok'));
    expect(result.result).toBe('ok');
    expect(result.probe).toEqual({ kind: 'response', statusCode: 200, finalUrl: url('/ok') });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('follows a same-host redirect and records the final URL', async () => {
    const result = await check(url('/redirect-same'));
    expect(result.result).toBe('ok');
    expect(result.probe).toMatchObject({ finalUrl: url('/ok') });
  });

  it('flags a redirect to another host as wrong_destination', async () => {
    const result = await check(url('/redirect-away'));
    expect(result.result).toBe('wrong_destination');
    expect(result.error).toBe('Ended on localhost');
  });

  it.each([
    ['/missing', 404],
    ['/server-error', 500],
  ])('is broken for %s', async (path, status) => {
    const result = await check(url(path));
    expect(result).toMatchObject({ result: 'broken', error: `HTTP ${status}` });
  });

  it('falls back to GET when HEAD is not allowed', async () => {
    const result = await check(url('/no-head'));
    expect(result.result).toBe('ok');
    expect(result.probe).toMatchObject({ statusCode: 200 });
  });

  it('times out on a slow response', async () => {
    const result = await check(url('/slow'));
    expect(result.result).toBe('timeout');
    expect(result.latencyMs).toBeLessThan(1_000);
  });

  it('is broken when the connection is refused', async () => {
    const result = await check(await closedPortUrl());
    expect(result).toMatchObject({ result: 'broken', error: 'ECONNREFUSED' });
  });

  it('is broken when the domain does not resolve', async () => {
    // .invalid is reserved and never resolves (offline it fails too, just with another code).
    const result = await check('http://listingwatch-test.invalid/');
    expect(result.result).toBe('broken');
    expect(result.probe.kind).toBe('network_error');
  });
});
