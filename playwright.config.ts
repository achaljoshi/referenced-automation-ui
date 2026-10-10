import { createPlaywrightConfig } from '@automation/referenced-automation-utils';
import { defineBddConfig } from 'playwright-bdd';

// Every repo in the family runs Playwright the same way, defined once in
// utils: BROWSER / DEVICE / HEADLESS / WORKERS / RETRIES / the *_TIMEOUT_MS
// family / TEST_ID_ATTRIBUTE / ... are all read from the active
// .env.<ENV> file or the real environment - see createPlaywrightConfig's
// doc comment for the full list. `dir: __dirname` makes the same
// .env.<ENV> load whether you start tests from a terminal, an IDE's Run
// button, or CI.
// Gherkin features: `bddgen` turns features/*.feature + features/steps/*.ts into runnable tests in .features-gen/
// (the npm scripts run it first). They are their own project, so `--project=bdd` runs only them.
const bddTestDir = defineBddConfig({
  features: 'features/*.feature',
  steps: 'features/steps/*.ts',
  outputDir: '.features-gen',
});

export default createPlaywrightConfig({
  dir: __dirname,
  name: '@automation/referenced-automation-ui',
  baseUrlKey: 'BASE_URL',
  // Visual baselines live beside the spec in one folder per spec, with no browser/OS suffix in the name: the suite's
  // screenshots are solid colours (identical everywhere). For pages with text, remove this override so each
  // browser/OS keeps its own baseline - or generate them in the CI container and commit those.
  extraProjects: [{ name: 'bdd', testDir: bddTestDir }],
  overrides: { snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}' },
});
