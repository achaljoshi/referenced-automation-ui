import { test as base } from '@playwright/test';
import { logger } from '@automation/referenced-automation-utils';

/**
 * Drop-in Playwright Test fixture: `import { test, expect } from
 * '@automation/referenced-automation-ui'` gets you the same `page` fixture
 * Playwright already provides, plus a start/pass/fail banner around every
 * test so scenario boundaries are as visible in raw console/CI logs as they
 * are in the HTML report - the equivalent of the old BDD framework's
 * SCENARIO START/PASSED/FAILED banner, without needing Gherkin for it.
 *
 * Screenshots/video/trace on failure are configured declaratively in
 * playwright.config.ts (`use: { screenshot: 'only-on-failure', ... }`) -
 * Playwright Test does that itself, no custom hook required here.
 */
export const test = base.extend({});

test.beforeEach(async ({}, testInfo) => {
  logger.info('================================================================');
  logger.info(`SCENARIO START : ${testInfo.title}`);
  logger.info(`FILE           : ${testInfo.file}`);
  logger.info(`TAGS           : ${testInfo.tags.join(', ')}`);
  logger.info('================================================================');
});

test.afterEach(async ({}, testInfo) => {
  const status = testInfo.status === testInfo.expectedStatus ? 'PASSED' : 'FAILED';
  const log = status === 'PASSED' ? logger.info.bind(logger) : logger.error.bind(logger);
  log(`SCENARIO ${status}  : ${testInfo.title} (${testInfo.duration}ms)`);
  logger.info('================================================================\n');
});

export { expect } from '@playwright/test';
