import type { Context } from 'aws-lambda';
import { Types, isValidObjectId } from 'mongoose';
import { z } from 'zod';
import { cachedSetup } from './lib/coldStart.js';
import { parseCheckerConfig } from './lib/config.js';
import { connectDb } from './lib/db.js';
import { logger } from './lib/logger.js';
import { loadSecretsFromSsm } from './lib/ssm.js';
import { CheckRun } from './models/CheckRun.js';
import { createRun, executeRun } from './services/checkRunner.js';

/**
 * The two ways the checker is started:
 * - the nightly EventBridge schedule sends { "trigger": "schedule" } (see template.yaml);
 * - POST /checks/run creates a "manual" run, then invokes us with its { runId }.
 */
export const checkerEventSchema = z.union([
  z.object({ trigger: z.literal('schedule') }),
  z.object({ runId: z.string().refine((id) => isValidObjectId(id), 'Invalid run id') }),
]);

// Runs once per cold start. Only MONGODB_URI is needed (and readable) here.
const setup = cachedSetup(async () => {
  await loadSecretsFromSsm();
  const config = parseCheckerConfig(process.env);
  await connectDb(config.MONGODB_URI);
});

/** Lambda entry for CheckerFunction. Throws if the run fails, so the Errors alarm fires. */
export async function handler(event: unknown, context: Context) {
  const requestId = context.awsRequestId;
  const parsed = checkerEventSchema.safeParse(event);
  if (!parsed.success) {
    logger.error({ requestId, issues: parsed.error.issues }, 'invalid checker event');
    throw new Error('Invalid checker event');
  }
  await setup(requestId);

  const job = parsed.data;
  let runId: Types.ObjectId;
  if ('runId' in job) {
    runId = new Types.ObjectId(job.runId);
    // Only pick up a run that is still waiting to be done. If the same event
    // arrives again after the run finished or failed, don't check everything
    // a second time under that run.
    const existing = await CheckRun.findById(runId, { status: 1 }).lean();
    if (existing?.status !== 'running') {
      logger.warn(
        { requestId, runId: job.runId, status: existing?.status ?? 'missing' },
        'skipping a run that is not waiting to be done',
      );
      return { runId: job.runId, skipped: true };
    }
  } else {
    runId = (await createRun('schedule'))._id;
  }

  logger.info({ requestId, runId: String(runId) }, 'checker started');
  const run = await executeRun(runId);
  return { runId: String(runId), status: run?.status, totals: run?.totals };
}
