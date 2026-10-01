import type { CheckOutcome } from '../models/CheckResult.js';

/** What one HTTP probe of a URL observed, before any judgement. */
export type Probe =
  | { kind: 'response'; statusCode: number; finalUrl: string }
  | { kind: 'timeout' }
  // DNS failure, connection refused, TLS error, ... `code` is e.g. "ENOTFOUND".
  | { kind: 'network_error'; code: string };

export interface Classification {
  result: CheckOutcome;
  error?: string;
}

/**
 * Turn a probe into a result. Pure, so every branch is easy to unit test.
 * Order matters: a 404 on another host is "broken", not "wrong_destination".
 */
export function classify(expectedUrl: string, probe: Probe): Classification {
  if (probe.kind === 'timeout') return { result: 'timeout', error: 'Timed out' };
  if (probe.kind === 'network_error') return { result: 'broken', error: probe.code };

  if (probe.statusCode >= 400) return { result: 'broken', error: `HTTP ${probe.statusCode}` };

  const expectedHost = normalizeHost(expectedUrl);
  const finalHost = normalizeHost(probe.finalUrl);
  if (finalHost !== expectedHost) {
    return { result: 'wrong_destination', error: `Ended on ${finalHost ?? probe.finalUrl}` };
  }
  return { result: 'ok' };
}

/**
 * Hostname without a leading "www.", so example.com -> www.example.com is not a
 * different destination. URL already lowercases the hostname.
 */
export function normalizeHost(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}
