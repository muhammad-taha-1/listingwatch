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

export const DEFAULT_TIMEOUT_MS = 10_000;
const USER_AGENT = 'ListingWatchBot/1.0 (+https://github.com/muhammad-taha-1/listingwatch)';

// Network error codes that mean "too slow" rather than "doesn't work".
const TIMEOUT_CODES = new Set(['UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'ETIMEDOUT']);

/**
 * Request a URL and report what happened. Never throws.
 *
 * Tries HEAD first (no body to download) and falls back to GET when the server
 * doesn't allow HEAD. fetch follows redirects, and `response.url` is the final
 * URL after them. One timeout covers the whole probe, HEAD and GET together.
 */
export async function probeUrl(
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ probe: Probe; latencyMs: number }> {
  const started = performance.now();
  const signal = AbortSignal.timeout(timeoutMs);
  const latency = () => Math.round(performance.now() - started);

  try {
    let response = await request(url, 'HEAD', signal);
    if (response.status === 405 || response.status === 501) {
      response = await request(url, 'GET', signal);
    }
    return {
      probe: { kind: 'response', statusCode: response.status, finalUrl: response.url || url },
      latencyMs: latency(),
    };
  } catch (err) {
    return { probe: toFailedProbe(err), latencyMs: latency() };
  }
}

async function request(url: string, method: 'HEAD' | 'GET', signal: AbortSignal) {
  const response = await fetch(url, {
    method,
    redirect: 'follow',
    signal,
    headers: { 'user-agent': USER_AGENT },
  });
  // We only need the status and final URL; don't download the body.
  await response.body?.cancel();
  return response;
}

/** Map a fetch rejection to a timeout or a network error with a short code. */
function toFailedProbe(err: unknown): Probe {
  if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    return { kind: 'timeout' };
  }
  // fetch rejects with TypeError("fetch failed") and puts the real reason in
  // `cause`, e.g. { code: "ENOTFOUND" } or Error("redirect count exceeded").
  const cause = err instanceof Error ? err.cause : undefined;
  const code = errorCode(cause) ?? errorCode(err);
  if (code && TIMEOUT_CODES.has(code)) return { kind: 'timeout' };
  const message = cause instanceof Error ? cause.message : undefined;
  return { kind: 'network_error', code: code ?? message ?? 'FETCH_FAILED' };
}

function errorCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string') {
    return err.code;
  }
  return undefined;
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
