import { createPlaywrightConfig } from '@automation/referenced-automation-utils';

// Every repo in the family runs Playwright the same way, defined once in
// utils: BROWSER / DEVICE / HEADLESS / WORKERS / RETRIES / the *_TIMEOUT_MS
// family / TEST_ID_ATTRIBUTE / ... are all read from the active
// .env.<ENV> file or the real environment - see createPlaywrightConfig's
// doc comment for the full list. `dir: __dirname` makes the same
// .env.<ENV> load whether you start tests from a terminal, an IDE's Run
// button, or CI.
export default createPlaywrightConfig({
  dir: __dirname,
  name: '@automation/referenced-automation-ui',
  baseUrlKey: 'BASE_URL',
});
