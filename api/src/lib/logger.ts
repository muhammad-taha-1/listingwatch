import { pino } from 'pino';

// Read LOG_LEVEL directly so the logger can be imported before config is loaded
// (e.g. to log a config failure). Validation still happens in config.ts.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'listingwatch-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie'],
    censor: '[redacted]',
  },
});

export type Logger = typeof logger;
