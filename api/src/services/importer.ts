import { parse as parseCsv } from 'csv-parse/sync';
import { ValidationError, formatZodIssues } from '../lib/errors.js';
import { Restaurant, restaurantInputSchema, type RestaurantInput } from '../models/Restaurant.js';

export const MAX_IMPORT_ROWS = 1000;
const REQUIRED_COLUMNS = ['name', 'city', 'expectedOrderUrl'] as const;
const KNOWN_COLUMNS = new Set<string>([...REQUIRED_COLUMNS, 'description']);

export interface RowError {
  /** 1-based line in the file (header is line 1). */
  line: number;
  issues: { path: string; message: string }[];
}

export interface ParsedCsv {
  rows: { line: number; data: RestaurantInput }[];
  errors: RowError[];
}

export interface ImportResult {
  inserted: number;
  /** Rows that matched an existing restaurant (same name + city) and were left unchanged. */
  skipped: number;
  failed: number;
  errors: RowError[];
}

/**
 * Parse CSV text with header `name,city,expectedOrderUrl,description` and
 * validate each row. Bad rows are collected instead of failing the file.
 * Throws a ValidationError only for problems with the file as a whole.
 */
export function parseRestaurantCsv(text: string): ParsedCsv {
  let records: string[][];
  try {
    records = parseCsv(text, {
      bom: true,
      skip_empty_lines: true,
      trim: true,
      // Report wrong column counts per row (below) instead of failing the file.
      relax_column_count: true,
    });
  } catch (err) {
    throw new ValidationError(undefined, `Could not parse CSV: ${(err as Error).message}`);
  }

  const [header, ...dataRows] = records;
  if (!header) throw new ValidationError(undefined, 'CSV is empty');

  const missing = REQUIRED_COLUMNS.filter((col) => !header.includes(col));
  const unknown = header.filter((col) => !KNOWN_COLUMNS.has(col));
  if (missing.length > 0 || unknown.length > 0) {
    throw new ValidationError(
      { missing, unknown },
      `CSV header must be: name,city,expectedOrderUrl,description`,
    );
  }
  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw new ValidationError(undefined, `CSV has more than ${MAX_IMPORT_ROWS} rows`);
  }

  const result: ParsedCsv = { rows: [], errors: [] };
  dataRows.forEach((cells, index) => {
    const line = index + 2;
    if (cells.length !== header.length) {
      result.errors.push({
        line,
        issues: [{ path: '', message: `Expected ${header.length} columns, got ${cells.length}` }],
      });
      return;
    }
    const raw = Object.fromEntries(header.map((col, i) => [col, cells[i]]));
    const parsed = restaurantInputSchema.safeParse(raw);
    if (parsed.success) result.rows.push({ line, data: parsed.data });
    else result.errors.push({ line, issues: formatZodIssues(parsed.error) });
  });
  return result;
}

/**
 * Insert restaurants that don't exist yet; existing (name, city) pairs are
 * skipped, never overwritten. Safe to run repeatedly.
 */
export async function importRestaurants(rows: RestaurantInput[]): Promise<{ inserted: number; skipped: number }> {
  if (rows.length === 0) return { inserted: 0, skipped: 0 };

  const now = new Date();
  const result = await Restaurant.bulkWrite(
    rows.map((row) => ({
      updateOne: {
        filter: { name: row.name, city: row.city },
        // $setOnInsert only writes when the upsert creates a new document.
        update: { $setOnInsert: { ...row, createdAt: now, updatedAt: now } },
        upsert: true,
        // Match the unique index's case-insensitive collation.
        collation: { locale: 'en', strength: 2 },
        // We set timestamps ourselves so skipped rows don't get updatedAt bumped.
        timestamps: false,
      },
    })),
    { ordered: false },
  );
  return { inserted: result.upsertedCount, skipped: rows.length - result.upsertedCount };
}

export async function importRestaurantCsv(text: string): Promise<ImportResult> {
  const { rows, errors } = parseRestaurantCsv(text);
  const { inserted, skipped } = await importRestaurants(rows.map((r) => r.data));
  return { inserted, skipped, failed: errors.length, errors };
}
