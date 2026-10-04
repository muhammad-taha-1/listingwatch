import {
  GetParametersCommand,
  SSMClient,
  type GetParametersCommandOutput,
} from '@aws-sdk/client-ssm';
import { ConfigError } from './config.js';

/**
 * Secrets that live in SSM Parameter Store in production. Each key is the env
 * var holding the parameter NAME (set in template.yaml); each value is the env
 * var that receives the decrypted value, which config.ts then validates.
 */
export const SECRET_PARAMS = {
  MONGODB_URI_PARAM: 'MONGODB_URI',
  ANTHROPIC_API_KEY_PARAM: 'ANTHROPIC_API_KEY',
  ADMIN_TOKEN_PARAM: 'ADMIN_TOKEN',
} as const;

/** Fetch parameters by name, decrypted. Swappable so tests don't call AWS. */
export type FetchParameters = (names: string[]) => Promise<GetParametersCommandOutput>;

const fetchFromSsm: FetchParameters = (names) =>
  // Region and credentials come from the Lambda environment automatically.
  new SSMClient({}).send(new GetParametersCommand({ Names: names, WithDecryption: true }));

/**
 * Copy secrets from SSM into env, so loadConfig() validates them exactly like
 * values from a local .env file. Uses one GetParameters call for all of them
 * (one round trip on cold start). Does nothing when no *_PARAM vars are set,
 * which is the case locally and in tests.
 *
 * Callers run this once per Lambda container; the values then stay in
 * process.env for every warm invocation. Never logs the values.
 */
export async function loadSecretsFromSsm(
  env: NodeJS.ProcessEnv = process.env,
  fetchParameters: FetchParameters = fetchFromSsm,
): Promise<void> {
  const wanted = Object.entries(SECRET_PARAMS).flatMap(([paramVar, target]) => {
    const name = env[paramVar];
    return name ? [{ name, target }] : [];
  });
  if (wanted.length === 0) return;

  const { Parameters = [], InvalidParameters = [] } = await fetchParameters(
    wanted.map((w) => w.name),
  );
  if (InvalidParameters.length > 0) {
    // Parameter names aren't secret, so they're safe to report.
    throw new ConfigError(`SSM parameters not found: ${InvalidParameters.join(', ')}`);
  }

  const values = new Map(Parameters.map((p) => [p.Name, p.Value]));
  for (const { name, target } of wanted) {
    const value = values.get(name);
    if (value === undefined) throw new ConfigError(`SSM parameter ${name} has no value`);
    env[target] = value;
  }
}
