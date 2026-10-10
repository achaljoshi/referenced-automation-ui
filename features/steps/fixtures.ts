import { mergeTests } from '@playwright/test';
import { test as bddTest } from 'playwright-bdd';
import { test as recordedTest } from '../../tests/support/recordedTest';

/**
 * The test the Gherkin steps run in: this package's `test` (page, vars, uiScenario, correlation id, scenario banner ...),
 * here with https://app.test answered by the fixture page so the sample features run offline. In your own project use
 * `import { test } from '@automation/referenced-automation-ui'` instead of `recordedTest`, set BASE_URL, and the
 * features open your real pages.
 */
// playwright-bdd needs its own `test` underneath; mergeTests combines it with the UI one.
export const test = mergeTests(bddTest, recordedTest);
