import { test, expect } from '@playwright/test';
import { createPlaywrightConfig, loadEnv, logger, placeholders } from '@automation/referenced-automation-utils';

/**
 * A thin import check, not a re-test of utils: the utils package has its own suite (crypto, dates, random data, JSON/YAML/
 * CSV/Excel, schema validation, SMTP/SFTP/SQLite ...). All this repo needs to know is that the pieces IT builds on
 * resolve from the installed package and still behave as its code expects - a broken or mismatched install fails here
 * with a clear name rather than deep inside a UI test. Deliberately not tagged @smoke: it says nothing about the UI layer.
 */
test.describe('utils: what this package builds on', () => {
  test('the logger, config reader, placeholders and Playwright config factory resolve', () => {
    expect(typeof logger.info).toBe('function');
    expect(typeof loadEnv).toBe('function');
    expect(typeof createPlaywrightConfig).toBe('function');
    expect(new placeholders.ScenarioVariables().interpolate('id-{{uuid}}')).toMatch(/^id-[0-9a-f-]{36}$/);
  });
});
