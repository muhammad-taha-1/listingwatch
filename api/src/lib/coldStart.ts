import { logger } from './logger.js';

/**
 * Run a Lambda's setup (SSM secrets, config, Mongo pool, ...) once per
 * container and reuse the result in every warm invocation. Module scope
 * survives between warm invocations, which is what makes this work.
 *
 * A failed setup (e.g. Atlas unreachable) isn't cached, so the next
 * invocation tries again instead of failing forever.
 */
export function cachedSetup<T>(setup: () => Promise<T>): (requestId: string) => Promise<T> {
  let ready: Promise<T> | undefined;

  return (requestId) => {
    if (!ready) {
      const started = Date.now();
      ready = setup().then(
        (value) => {
          logger.info({ requestId, initMs: Date.now() - started }, 'cold start complete');
          return value;
        },
        (err: unknown) => {
          logger.error({ requestId, err }, 'cold start failed');
          ready = undefined;
          throw err;
        },
      );
    }
    return ready;
  };
}
