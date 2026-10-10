import { test, expect } from '@playwright/test';
import { runPlaywright, type NestedResult } from './support/runPlaywright';

// The Gherkin steps are plain functions registered with a Given/When/Then of the BDD tool, so they are run here the same
// way a BDD runner would: through their registration, on a real page, in a nested run (a failing step has to be observed
// as a failed test).

const SPEC = `
const { test, expect, registerUiSteps } = require(__FRAMEWORK__);
const steps = {};
const register = (pattern, fn) => { steps[pattern] = fn; };
registerUiSteps({ Given: register, When: register, Then: register });
const PAGE = \`<p style="display:none">Saved</p><p>Saved</p><p>Other</p>\`;
const run = (pattern, { uiScenario, vars }, ...args) => steps[pattern]({ uiScenario, vars }, ...args);

test('should see: passes when a later match is visible although the first is hidden', async ({ page, vars, uiScenario }) => {
  await page.setContent(PAGE);
  await run('I should see {string}', { uiScenario, vars }, 'Saved');
});

test('should not see: FAILS while any match is visible, even if the first match is hidden', async ({ page, vars, uiScenario }) => {
  await page.setContent(PAGE);
  await run('I should not see {string}', { uiScenario, vars }, 'Saved');
});

test('should not see: passes when no match is visible', async ({ page, vars, uiScenario }) => {
  await page.setContent('<p style="display:none">Saved</p><p>Other</p>');
  await run('I should not see {string}', { uiScenario, vars }, 'Saved');
});

test('should not see: passes once the text disappears (it waits, like every assertion)', async ({ page, vars, uiScenario }) => {
  await page.setContent('<p id="x">Saved</p><script>setTimeout(() => x.remove(), 300)</script>');
  await run('I should not see {string}', { uiScenario, vars }, 'Saved');
});

test('should see: fails when no match is visible', async ({ page, vars, uiScenario }) => {
  await page.setContent('<p style="display:none">Saved</p>');
  await run('I should see {string}', { uiScenario, vars }, 'Saved');
});
`;

test.describe('BDD "I should (not) see"', () => {
  let results: Record<string, NestedResult>;
  test.beforeAll(() => {
    results = Object.fromEntries(runPlaywright({ 'bdd.spec.js': SPEC }, 'expect: { timeout: 1500 },').map((r) => [r.title, r]));
  });

  test('"I should see" accepts a visible match that is not the first in the DOM', () => {
    expect((results['should see: passes when a later match is visible although the first is hidden'] as NestedResult).status).toBe('passed');
  });

  test('"I should not see" fails while any match is visible - the old .first() passed on a hidden first match', () => {
    const r = results['should not see: FAILS while any match is visible, even if the first match is hidden'] as NestedResult;
    expect(r.status).toBe('failed');
    expect(r.errors.join('\n')).toMatch(/toHaveCount|Expected: 0|count/i);
  });

  test('"I should not see" passes when nothing is visible, and waits for text to go', () => {
    expect((results['should not see: passes when no match is visible'] as NestedResult).status).toBe('passed');
    expect((results['should not see: passes once the text disappears (it waits, like every assertion)'] as NestedResult).status).toBe('passed');
  });

  test('"I should see" fails when nothing is visible', () => {
    expect((results['should see: fails when no match is visible'] as NestedResult).status).toBe('failed');
  });
});
