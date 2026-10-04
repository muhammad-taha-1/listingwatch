import { describe, expect, it, vi } from 'vitest';
import { ConfigError } from '../src/lib/config.js';
import { loadSecretsFromSsm, type FetchParameters } from '../src/lib/ssm.js';

const paramEnv = {
  MONGODB_URI_PARAM: '/listingwatch/MONGODB_URI',
  ANTHROPIC_API_KEY_PARAM: '/listingwatch/ANTHROPIC_API_KEY',
  ADMIN_TOKEN_PARAM: '/listingwatch/ADMIN_TOKEN',
};

/** Fake SSM that knows the given name -> value pairs. */
function fakeSsm(store: Record<string, string>) {
  return vi.fn<FetchParameters>(async (names) => ({
    $metadata: {},
    Parameters: names.filter((n) => n in store).map((n) => ({ Name: n, Value: store[n] })),
    InvalidParameters: names.filter((n) => !(n in store)),
  }));
}

describe('loadSecretsFromSsm', () => {
  it('copies every secret into env with a single SSM call', async () => {
    const env: NodeJS.ProcessEnv = { ...paramEnv };
    const fetchParameters = fakeSsm({
      '/listingwatch/MONGODB_URI': 'mongodb+srv://from-ssm',
      '/listingwatch/ANTHROPIC_API_KEY': 'sk-from-ssm',
      '/listingwatch/ADMIN_TOKEN': 'admin-token-from-ssm',
    });

    await loadSecretsFromSsm(env, fetchParameters);

    expect(fetchParameters).toHaveBeenCalledTimes(1);
    expect(env).toMatchObject({
      MONGODB_URI: 'mongodb+srv://from-ssm',
      ANTHROPIC_API_KEY: 'sk-from-ssm',
      ADMIN_TOKEN: 'admin-token-from-ssm',
    });
  });

  it('does nothing when no parameter names are configured (local dev)', async () => {
    const env: NodeJS.ProcessEnv = { MONGODB_URI: 'mongodb://localhost' };
    const fetchParameters = fakeSsm({});

    await loadSecretsFromSsm(env, fetchParameters);

    expect(fetchParameters).not.toHaveBeenCalled();
    expect(env).toEqual({ MONGODB_URI: 'mongodb://localhost' });
  });

  it('fails fast naming missing parameters, without leaking found values', async () => {
    const env: NodeJS.ProcessEnv = { ...paramEnv };
    const fetchParameters = fakeSsm({ '/listingwatch/MONGODB_URI': 'secret-uri' });

    const error = await loadSecretsFromSsm(env, fetchParameters).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ConfigError);
    const message = (error as ConfigError).message;
    expect(message).toContain('/listingwatch/ANTHROPIC_API_KEY');
    expect(message).toContain('/listingwatch/ADMIN_TOKEN');
    expect(message).not.toContain('secret-uri');
    expect(env.MONGODB_URI).toBeUndefined();
  });
});
