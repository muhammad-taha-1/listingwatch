/**
 * Seed the database with ~30 sample restaurants from sample-restaurants.csv.
 *
 *   npm run seed            # insert missing restaurants (safe to re-run)
 *   npm run seed -- --reset # delete ALL restaurants first
 *
 * The rows are grouped to exercise the Phase 2 link checker and Phase 3 AI reviewer:
 *   - ok:                stable sites, a slow-but-fine one (3s), same-host redirects
 *   - broken:            404/500/410/403 responses and .invalid domains (DNS failure)
 *   - wrong_destination: httpbin redirect-to another domain
 *   - timeout:           httpbin /delay/10 and non-routable 10.255.255.x addresses
 *   - AI review cases:   hype, vague, empty, prompt-injection and made-up health claims
 *
 * The URLs are real public test/reference sites, not the restaurants' own sites.
 */
import { readFile } from 'node:fs/promises';
import { loadConfig } from '../src/lib/config.js';
import { connectDb, disconnectDb } from '../src/lib/db.js';
import { logger } from '../src/lib/logger.js';
import { Restaurant } from '../src/models/Restaurant.js';
import { importRestaurantCsv } from '../src/services/importer.js';

async function main() {
  const config = loadConfig();
  await connectDb(config.MONGODB_URI);
  await Restaurant.syncIndexes();

  if (process.argv.includes('--reset')) {
    const { deletedCount } = await Restaurant.deleteMany({});
    logger.info({ deletedCount }, 'deleted existing restaurants');
  }

  const csv = await readFile(new URL('./sample-restaurants.csv', import.meta.url), 'utf8');
  const result = await importRestaurantCsv(csv);
  logger.info(result, 'seed complete');
  if (result.failed > 0) process.exitCode = 1;
}

main()
  .catch((err: unknown) => {
    logger.fatal({ err }, 'seed failed');
    process.exitCode = 1;
  })
  .finally(() => disconnectDb());
