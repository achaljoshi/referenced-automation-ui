import { test } from '@playwright/test';
import { logger } from '@automation/referenced-automation-utils';

/**
 * Wraps an action in both Playwright's own test.step() (shows up as a step
 * in the HTML report and trace viewer) and the shared logger (console +
 * logs/automation.log, visible in raw CI job logs too) - every BasePage
 * action goes through this so both views stay in sync automatically.
 */
export function step<T>(name: string, action: () => Promise<T> | T): Promise<T> {
  return test.step(name, async () => {
    const startedAt = Date.now();
    logger.info(`>> STEP: ${name}`);
    try {
      const result = await action();
      logger.info(`<< STEP PASSED (${Date.now() - startedAt}ms): ${name}`);
      return result;
    } catch (error) {
      logger.error(`<< STEP FAILED (${Date.now() - startedAt}ms): ${name}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });
}
