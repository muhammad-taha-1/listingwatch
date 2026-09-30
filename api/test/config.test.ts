import { describe, expect, it } from 'vitest';
import { ConfigError, parseConfig } from '../src/lib/config.js';

const valid = {
  MONGODB_URI: 'mongodb://localhost:27017/listingwatch',
  ADMIN_TOKEN: 'a-long-enough-admin-token',
};

describe('parseConfig', () => {
  it('applies defaults for optional values', () => {
    const config = parseConfig(valid);
    expect(config).toMatchObject({ PORT: 4000, LOG_LEVEL: 'info', NODE_ENV: 'development' });
  });

  it('fails fast when a required value is missing', () => {
    expect(() => parseConfig({ ADMIN_TOKEN: valid.ADMIN_TOKEN })).toThrow(ConfigError);
    expect(() => parseConfig({ ADMIN_TOKEN: valid.ADMIN_TOKEN })).toThrow(/MONGODB_URI/);
  });

  it('rejects a short admin token without echoing its value', () => {
    let message = '';
    try {
      parseConfig({ ...valid, ADMIN_TOKEN: 'short-secret' });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/ADMIN_TOKEN/);
    expect(message).not.toContain('short-secret');
  });
});
