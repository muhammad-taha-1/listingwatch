import pLimit from 'p-limit';
import type { Types } from 'mongoose';
import { logger } from '../lib/logger.js';
import { CheckResult, type CheckOutcome } from '../models/CheckResult.js';
import { CheckRun, type CheckTrigger } from '../models/CheckRun.js';
import { Restaurant } from '../models/Restaurant.js';
import { DEFAULT_TIMEOUT_MS, classify, probeUrl } from './linkChecker.js';

export const DEFAULT_CONCURRENCY = 5;

export interface RunOptions {
  timeoutMs?: number;
  concurrency?: number;
}

/**
 * Create a run in "running" state. Split from executeRun so the API can return
 * the runId straight away (202) while the checks continue.
 */
export async function createRun(trigger: CheckTrigger) {
  return CheckRun.create({ trigger });
}

/**
 * Run the checks without waiting for them (used by POST /checks/run).
 *
 * This works for the long-running local server. On Lambda it won't: the
 * function is frozen once the response is sent. Phase 6 replaces this body with
 * an async invoke of the checker Lambda; callers don't change.
 */
export function dispatchRun(runId: Types.ObjectId): void {
  // executeRun already logs and marks the run failed; this only stops an
  // unhandled rejection from crashing the process.
  executeRun(runId).catch(() => undefined);
}

/**
 * Check every restaurant's order URL and record one result each.
 *
 * - p-limit caps parallel requests, so we don't flood the network or the sites.
 * - Each result is saved as soon as its check finishes, so a crash mid-run keeps
 *   what was done so far.
 * - Promise.allSettled means one failing check never stops the others; it is
 *   counted as "crashed" instead.
 *
 * Marks the run "failed" and rethrows if the run as a whole can't proceed
 * (e.g. the database is down).
 *
 * Every run ends with exactly one "run_summary" log line (completed or failed),
 * which CloudWatch queries and the missed-run alarm are built on.
 */
export async function executeRun(runId: Types.ObjectId, options: RunOptions = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, concurrency = DEFAULT_CONCURRENCY } = options;
  const log = logger.child({ runId: String(runId) });
  const started = Date.now();
  let trigger: CheckTrigger | undefined;
  let restaurantCount: number | undefined;

  try {
    const restaurants = await Restaurant.find({}, { expectedOrderUrl: 1 }).lean();
    restaurantCount = restaurants.length;
    const runDoc = await CheckRun.findByIdAndUpdate(
      runId,
      { restaurantCount },
      { returnDocument: 'after', projection: { trigger: 1 } },
    );
    if (!runDoc) throw new Error(`Check run ${String(runId)} not found`);
    trigger = runDoc.trigger;
    log.info({ trigger, restaurantCount, concurrency, timeoutMs }, 'check run started');

    const limit = pLimit(concurrency);
    const settled = await Promise.allSettled(
      restaurants.map((restaurant) =>
        limit(() => checkOne(runId, restaurant._id, restaurant.expectedOrderUrl, timeoutMs)),
      ),
    );

    const totals = { ok: 0, broken: 0, wrong_destination: 0, timeout: 0, crashed: 0 };
    settled.forEach((outcome, i) => {
      if (outcome.status === 'fulfilled') {
        totals[outcome.value] += 1;
      } else {
        totals.crashed += 1;
        log.error({ err: outcome.reason, restaurantId: String(restaurants[i]?._id) }, 'check crashed');
      }
    });

    const run = await CheckRun.findByIdAndUpdate(
      runId,
      { status: 'completed', finishedAt: new Date(), totals },
      { returnDocument: 'after' },
    );
    log.info(
      { trigger, status: 'completed', restaurantCount, totals, durationMs: Date.now() - started },
      'run_summary',
    );
    return run;
  } catch (err) {
    log.error({ err }, 'check run failed');
    await CheckRun.updateOne({ _id: runId }, { status: 'failed', finishedAt: new Date() }).catch(
      (updateErr: unknown) => log.error({ err: updateErr }, 'could not mark run as failed'),
    );
    log.error(
      { trigger, status: 'failed', restaurantCount, durationMs: Date.now() - started },
      'run_summary',
    );
    throw err;
  }
}

async function checkOne(
  runId: Types.ObjectId,
  restaurantId: Types.ObjectId,
  url: string,
  timeoutMs: number,
): Promise<CheckOutcome> {
  const { probe, latencyMs } = await probeUrl(url, timeoutMs);
  const { result, error } = classify(url, probe);
  await CheckResult.create({
    runId,
    restaurantId,
    result,
    error,
    latencyMs,
    ...(probe.kind === 'response' && { statusCode: probe.statusCode, finalUrl: probe.finalUrl }),
  });
  return result;
}
