import { test as base } from '@playwright/test';
import { getCorrelationId, logger, useTestCorrelation } from '@automation/referenced-automation-utils';

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
/** The banner lines that open a scenario. Exported so the format is tested rather than assumed. */
export function logScenarioStart(testInfo: { title: string; file: string; tags: string[] }): void {
  logger.info('================================================================');
  logger.info(`SCENARIO START : ${testInfo.title}`);
  logger.info(`FILE           : ${testInfo.file}`);
  logger.info(`TAGS           : ${testInfo.tags.join(', ')}`);
  logger.info(`CORRELATION    : ${getCorrelationId()}`);
  logger.info('================================================================');
}

/** The banner lines that close a scenario: PASSED / FAILED (an expected failure counts as passed) and how long it took. */
export function logScenarioEnd(testInfo: { title: string; status?: string; expectedStatus: string; duration: number }): void {
  const status = testInfo.status === testInfo.expectedStatus ? 'PASSED' : 'FAILED';
  const log = status === 'PASSED' ? logger.info.bind(logger) : logger.error.bind(logger);
  log(`SCENARIO ${status}  : ${testInfo.title} (${testInfo.duration}ms)`);
  logger.info('================================================================\n');
}

export const test = base.extend<{
  /** This test's correlation ID - automatic (every test gets one), shown in the scenario banner and on every log line, and added to the test report. Request it only if you need the value itself, e.g. to pass it to an API call. */
  correlationId: string;
  /** The start/pass/fail banner - automatic. An auto fixture rather than a module-level `test.beforeEach`, so importing this module has no side effects (tools like `bddgen` import it outside a test run), and it applies only to tests that use THIS `test`. */
  scenarioBanner: void;
}>({
  correlationId: [async ({}, use, testInfo) => useTestCorrelation(testInfo, use), { auto: true }],
  scenarioBanner: [
    async ({ correlationId }, use, testInfo) => {
      void correlationId; // depend on it, so the banner shows this test's id
      logScenarioStart(testInfo);
      await use();
      logScenarioEnd(testInfo);
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
