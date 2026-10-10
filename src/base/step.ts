import { test } from '@playwright/test';
import { logger } from '@automation/referenced-automation-utils';
import { redactError } from './secrets';

export interface StepOptions {
  /**
   * Values that must never appear in the error text: a failed action's message repeats what was typed in its call
   * log. They are replaced by `***` (in the message and stack) before the error is logged and rethrown.
   */
  redact?: readonly string[];
}

/**
 * Wraps an action in both Playwright's own test.step() (shows up as a step
 * in the HTML report and trace viewer) and the shared logger (console +
 * logs/automation.log, visible in raw CI job logs too) - every actions.*
 * and assertions.* call goes through this so both views stay in sync
 * automatically.
 *
 * The name goes to the report and the log as written: never put a secret in it (the actions that type values
 * show `***` for secret ones, see `SecretOption`).
 */
export function step<T>(name: string, action: () => Promise<T> | T, options: StepOptions = {}): Promise<T> {
  return test.step(name, async () => {
    const startedAt = Date.now();
    logger.info(`>> STEP: ${name}`);
    try {
      const result = await action();
      logger.info(`<< STEP PASSED (${Date.now() - startedAt}ms): ${name}`);
      return result;
    } catch (error) {
      redactError(error, options.redact);
      logger.error(`<< STEP FAILED (${Date.now() - startedAt}ms): ${name}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });
}
