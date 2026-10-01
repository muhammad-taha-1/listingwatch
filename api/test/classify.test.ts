import { describe, expect, it } from 'vitest';
import { classify, normalizeHost } from '../src/services/linkChecker.js';

const expected = 'https://order.pizzapalace.example/menu';

function response(statusCode: number, finalUrl = expected) {
  return { kind: 'response', statusCode, finalUrl } as const;
}

describe('classify', () => {
  it('is ok for a 2xx on the expected host', () => {
    expect(classify(expected, response(200))).toEqual({ result: 'ok' });
  });

  it('is ok after a redirect that stays on the same host', () => {
    const probe = response(200, 'https://order.pizzapalace.example/menu/today');
    expect(classify(expected, probe)).toEqual({ result: 'ok' });
  });

  it('ignores www. and hostname case', () => {
    expect(classify('https://pizza.example/', response(200, 'https://WWW.Pizza.example/'))).toEqual({
      result: 'ok',
    });
  });

  it('is wrong_destination when the final host differs', () => {
    expect(classify(expected, response(200, 'https://aggregator.example/pizza-palace'))).toEqual({
      result: 'wrong_destination',
      error: 'Ended on aggregator.example',
    });
  });

  it('treats a subdomain change as a different destination', () => {
    const probe = response(200, 'https://pizzapalace.example/');
    expect(classify(expected, probe).result).toBe('wrong_destination');
  });

  it.each([404, 410, 403, 500, 503])('is broken for HTTP %i', (status) => {
    expect(classify(expected, response(status))).toEqual({
      result: 'broken',
      error: `HTTP ${status}`,
    });
  });

  it('is broken (not wrong_destination) for an error page on another host', () => {
    const probe = response(404, 'https://aggregator.example/missing');
    expect(classify(expected, probe).result).toBe('broken');
  });

  it('is broken for network errors such as DNS failure', () => {
    expect(classify(expected, { kind: 'network_error', code: 'ENOTFOUND' })).toEqual({
      result: 'broken',
      error: 'ENOTFOUND',
    });
  });

  it('is timeout when the probe timed out', () => {
    expect(classify(expected, { kind: 'timeout' }).result).toBe('timeout');
  });
});

describe('normalizeHost', () => {
  it('strips www. and returns undefined for unparseable URLs', () => {
    expect(normalizeHost('https://www.example.com:8443/x')).toBe('example.com');
    expect(normalizeHost('not a url')).toBeUndefined();
  });
});
