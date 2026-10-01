import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  ADMIN_TOKEN: z.string().min(16, 'ADMIN_TOKEN must be at least 16 characters'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  // Optional until Phase 3 (AI reviewer) makes it required.
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
});

export type Config = z.infer<typeof configSchema>;

export class ConfigError extends Error {
  override name = 'ConfigError';
}

/** Validate an env object. Pure, so it's easy to test. */
export function parseConfig(env: Record<string, string | undefined>): Config {
  // Treat `KEY=` (empty string) as unset, so optional keys and defaults behave
  // the same whether the line is blank or missing from .env.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''));
  const result = configSchema.safeParse(cleaned);
  if (!result.success) {
    // Only report which keys are wrong, never the values (they may be secrets).
    const problems = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new ConfigError(`Invalid configuration: ${problems}`);
  }
  return result.data;
}

let cached: Config | undefined;

/**
 * Load config once from process.env and cache it. In Phase 5 the Lambda entry
 * will copy SSM parameters into process.env before calling this.
 */
export function loadConfig(): Config {
  cached ??= parseConfig(process.env);
  return cached;
}

/** Test helper: forget the cached config. */
export function resetConfigCache(): void {
  cached = undefined;
}
