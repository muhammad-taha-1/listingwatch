/**
 * Run the AI reviewer over every restaurant that has a description and print
 * the scores, token usage and total cost. This calls the real Anthropic API
 * and costs money (a few cents for the seed data with Claude Haiku 4.5).
 *
 *   npm run review:all
 *   npx tsx --env-file=.env scripts/review-all.ts --limit 3   # try a few first
 *                       (npm drops arguments after `--` in Windows PowerShell)
 */
import pLimit from 'p-limit';
import { loadConfig } from '../src/lib/config.js';
import { connectDb, disconnectDb } from '../src/lib/db.js';
import { logger } from '../src/lib/logger.js';
import { CRITERIA } from '../src/models/AiReview.js';
import { Restaurant } from '../src/models/Restaurant.js';
import { createAiReviewer, createAnthropicClient } from '../src/services/aiReviewer.js';
import { reviewRestaurant } from '../src/services/reviews.js';

// Small, to stay well inside the API's per-minute rate limits.
const CONCURRENCY = 3;

function readLimit(): number | undefined {
  const index = process.argv.indexOf('--limit');
  if (index === -1) return undefined;
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value < 1) throw new Error('--limit needs a positive integer');
  return value;
}

async function main() {
  const config = loadConfig();
  await connectDb(config.MONGODB_URI);
  const reviewer = createAiReviewer(createAnthropicClient(config.ANTHROPIC_API_KEY));
  const log = logger.child({ runId: `review-all-${Date.now()}` });

  const query = Restaurant.find({ description: { $nin: ['', null] } }).sort({ name: 1 });
  const limit = readLimit();
  if (limit) query.limit(limit);
  const restaurants = await query;
  log.info({ restaurants: restaurants.length }, 'reviewing restaurants');

  const run = pLimit(CONCURRENCY);
  const rows = await Promise.all(
    restaurants.map((restaurant) =>
      run(async () => {
        try {
          const review = await reviewRestaurant(restaurant, reviewer, log);
          return {
            name: restaurant.name,
            score: review.score,
            // e.g. "15/10/20/15/0", in CRITERIA order
            criteria: CRITERIA.map((key) => review.criteria[key].score).join('/'),
            issues: review.issues.map((issue) => issue.type).join(', '),
            inputTokens: review.inputTokens,
            outputTokens: review.outputTokens,
            costUsd: review.costUsd,
            failed: false,
          };
        } catch (err) {
          log.error({ err, restaurantId: String(restaurant._id) }, 'review failed');
          return { name: restaurant.name, issues: 'FAILED', failed: true, costUsd: 0, inputTokens: 0, outputTokens: 0 };
        }
      }),
    ),
  );

  console.log(`criteria order: ${CRITERIA.join('/')}`);
  console.table(rows.map(({ failed: _failed, ...row }) => row));
  const failed = rows.filter((row) => row.failed).length;
  const total = rows.reduce(
    (sum, row) => ({
      inputTokens: sum.inputTokens + row.inputTokens,
      outputTokens: sum.outputTokens + row.outputTokens,
      costUsd: sum.costUsd + row.costUsd,
    }),
    { inputTokens: 0, outputTokens: 0, costUsd: 0 },
  );
  log.info(
    { reviewed: rows.length - failed, failed, ...total, costUsd: Number(total.costUsd.toFixed(6)) },
    'review run complete',
  );
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err: unknown) => {
    logger.fatal({ err }, 'review run failed');
    process.exitCode = 1;
  })
  .finally(() => disconnectDb());
