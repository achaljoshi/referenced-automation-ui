import { test as base, type BrowserContext, type Page, type TestInfo, type Video } from '@playwright/test';
import { getCorrelationId, logger, placeholders, useTestCorrelation } from '@automation/referenced-automation-utils';
import { guardPage, type PageGuard } from '../diagnostics/pageGuard';
import { UiScenario } from '../bdd/scenario';

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

export interface UiFixtures {
  /** This test's named values and `{{placeholders}}` ({{uuid}}, {{random:email}}, {{date:+7d}}, {{env:X}}, {{name}}): `vars.interpolate('user-{{uuid}}')`. Used by the Gherkin steps, handy anywhere. */
  vars: placeholders.ScenarioVariables;
  /** What a Gherkin scenario carries between steps (which tab the steps act on, recorded dialogs, the last download, the page guard). */
  uiScenario: UiScenario;
  /** Watches `page` for console errors, uncaught exceptions, failed requests and 4xx/5xx; attaches what it found to the report. Request it to start watching (or use `guardedTest` to watch every test). */
  pageGuard: PageGuard;
  /** Makes `pageGuard` fail the test when it saw a problem (default false: problems are attached, not fatal). Set with `test.use({ failOnPageProblems: true })`. */
  failOnPageProblems: boolean;
  /** Messages / URLs `pageGuard` ignores - known third-party noise. `test.use({ pageProblemsIgnore: [/analytics/] })`. */
  pageProblemsIgnore: Array<string | RegExp>;
  /** A page already signed in from a saved storage state, in its own context - for a second user in the same test. Closed after the test. */
  pageAs: (storageStateFile: string, contextOptions?: Parameters<import('@playwright/test').Browser['newContext']>[0]) => Promise<Page>;
}

export const test = base.extend<UiFixtures & {
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

  vars: async ({}, use) => {
    await use(new placeholders.ScenarioVariables());
  },

  uiScenario: async ({ page }, use) => {
    await use(new UiScenario(page));
  },

  failOnPageProblems: [false, { option: true }],
  pageProblemsIgnore: [[], { option: true }],

  pageGuard: async ({ page, failOnPageProblems, pageProblemsIgnore }, use, testInfo) => {
    const guard = guardPage(page, { ignore: pageProblemsIgnore });
    await use(guard);
    guard.stop();
    await guard.attach(testInfo);
    // Only a test that otherwise passed is failed for this: a failing test already has its own reason.
    if (failOnPageProblems && testInfo.status === testInfo.expectedStatus) guard.expectClean();
  },

  pageAs: async ({ browser, baseURL, video }, use, testInfo) => {
    const opened: Array<{ context: BrowserContext; videos: Video[] }> = [];
    await use(async (storageStateFile, contextOptions = {}) => {
      // The project's `use` options (viewport, locale, headers, ...) and `use.trace` (one trace.zip for every context of the
      // test) already apply to browser.newContext(); baseURL is passed on explicitly. Video is the one thing Playwright only
      // wires into its own `context` fixture, so it is done here.
      const recordVideo = recordsNow(video, testInfo);
      const context = await browser.newContext({
        baseURL,
        ...(recordVideo ? { recordVideo: { dir: testInfo.outputPath(`pageAs-${opened.length + 1}-video`), ...(typeof video === 'object' && video.size ? { size: video.size } : {}) } } : {}),
        ...contextOptions,
        storageState: storageStateFile,
      });
      const entry = { context, videos: [] as Video[] };
      context.on('page', (created) => void (created.video() && entry.videos.push(created.video() as Video)));
      opened.push(entry);
      const page = await context.newPage();
      return page;
    });
    const failed = testInfo.status !== testInfo.expectedStatus;
    for (const [index, { context, videos }] of opened.entries()) {
      const name = `pageAs-${index + 1}`;
      await context.close();
      for (const recording of videos) {
        if (keepsArtifact(video, testInfo, failed)) await testInfo.attach(`${name}-video`, { path: await recording.path(), contentType: 'video/webm' });
        else await recording.delete().catch(() => undefined);
      }
    }
  },
});

type CaptureMode = string | { mode: string; size?: { width: number; height: number } };
const modeOf = (option: CaptureMode | undefined) => (typeof option === 'object' ? option.mode : option ?? 'off');

/** Whether video should be recording during this attempt (Playwright's `use.video` modes). */
function recordsNow(option: CaptureMode | undefined, testInfo: TestInfo): boolean {
  const mode = modeOf(option);
  if (mode === 'on-first-retry') return testInfo.retry === 1;
  if (mode === 'on-all-retries') return testInfo.retry > 0;
  return mode !== 'off';
}

/** Whether what was recorded is kept (attached) given how the test ended. */
function keepsArtifact(option: CaptureMode | undefined, testInfo: TestInfo, failed: boolean): boolean {
  const mode = modeOf(option);
  if (mode === 'retain-on-failure') return failed;
  return mode !== 'off';
}

/** `test` with `pageGuard` switched on for every test: console errors, exceptions and failed requests are attached to each report (and fail the test with `test.use({ failOnPageProblems: true })`). */
export const guardedTest = test.extend<{ guard: void }>({
  guard: [
    async ({ pageGuard }, use) => {
      void pageGuard;
      await use();
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
