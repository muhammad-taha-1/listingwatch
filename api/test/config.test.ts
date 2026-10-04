import { describe, expect, it } from 'vitest';
import { ConfigError, parseCheckerConfig, parseConfig } from '../src/lib/config.js';

const valid = {
  MONGODB_URI: 'mongodb://localhost:27017/listingwatch',
  ADMIN_TOKEN: 'a-long-enough-admin-token',
  ANTHROPIC_API_KEY: 'test-anthropic-key',
};

describe('parseConfig', () => {
  it('applies defaults for optional values', () => {
    const config = parseConfig(valid);
    expect(config).toMatchObject({ PORT: 4000, LOG_LEVEL: 'info', NODE_ENV: 'development' });
  });

  it('treats empty values as unset', () => {
    const config = parseConfig({ ...valid, LOG_LEVEL: '' });
    expect(config.LOG_LEVEL).toBe('info');
    expect(() => parseConfig({ ...valid, MONGODB_URI: '' })).toThrow(/MONGODB_URI/);
    expect(() => parseConfig({ ...valid, ANTHROPIC_API_KEY: '' })).toThrow(/ANTHROPIC_API_KEY/);
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

describe('parseCheckerConfig', () => {
  it('needs only MONGODB_URI, not the API secrets', () => {
    const config = parseCheckerConfig({ MONGODB_URI: valid.MONGODB_URI });
    expect(config).toEqual({
      MONGODB_URI: valid.MONGODB_URI,
      NODE_ENV: 'development',
      LOG_LEVEL: 'info',
    });
  });

  it('fails fast without MONGODB_URI', () => {
    expect(() => parseCheckerConfig({})).toThrow(/MONGODB_URI/);
  });
});
