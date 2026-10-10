import { test, expect } from '@playwright/test';
import { looksSecret } from '../src/base/secrets';
import { runPlaywright, type NestedResult } from './support/runPlaywright';

// SEC-01: a typed password must not reach step titles, the log or an error - and "step titles" means what the reporters
// show, which includes Playwright's own `Fill "<value>"` API step, not only this package's wrapper. So these run real
// tests in a nested Playwright run with a reporter that records every step, and look at everything it saw.

// built at run time: a literal here would be (rightly) flagged by the repo's own secret scan
const TYPED = ['S3cr3t', 'Value', 'ZXQ!'].join('-');
const FROM_ENV = ['Env', 'P@ss', '9981'].join('-');
const VISIBLE = 'ada-visible-name';

const SPEC = `
const { test, expect, actions, registerUiSteps } = require(__FRAMEWORK__);
process.env.UI_NESTED_PASSWORD = ${JSON.stringify(FROM_ENV)};
const PAGE = \`
<label>Username <input id="u"></label>
<label>Password <input id="p" type="password"></label>
<label>Recovery answer <input id="answer" type="password" autocomplete="off"></label>
<label>API token <input id="t"></label>
<label>Nickname <input id="n"></label>
<label>Locked password <input id="locked" type="password" disabled></label>
<label>Display name <input id="d" type="password"></label>
\`;
test.beforeEach(async ({ page }) => page.setContent(PAGE));
// Checked inside the page: an \`expect(...).toHaveValue(secret)\` would put the secret in the test's OWN step, which is not what is being tested.
const valueIs = (page, selector, value) => page.evaluate(([s, v]) => document.querySelector(s).value === v, [selector, value]);

test('visible: a normal field keeps its value in the title', async ({ page }) => {
  await actions.fill(page.getByLabel('Username'), ${JSON.stringify(VISIBLE)});
  expect(await valueIs(page, '#u', ${JSON.stringify(VISIBLE)})).toBe(true);
});

test('password input: masked, and the value still arrives', async ({ page }) => {
  await actions.fill(page.getByLabel('Password', { exact: true }), ${JSON.stringify(TYPED)});
  expect(await valueIs(page, '#p', ${JSON.stringify(TYPED)})).toBe(true);
});

test('label looks secret on a plain text input: masked', async ({ page }) => {
  await actions.fill(page.getByLabel('API token'), ${JSON.stringify(TYPED)});
  expect(await valueIs(page, '#t', ${JSON.stringify(TYPED)})).toBe(true);
});

test('secret: true on a plain field', async ({ page }) => {
  await actions.fill(page.getByLabel('Nickname'), ${JSON.stringify(TYPED)}, { secret: true });
  expect(await valueIs(page, '#n', ${JSON.stringify(TYPED)})).toBe(true);
});

test('secret: false does not guess from the name, but a password input stays masked', async ({ page }) => {
  await actions.fill(page.getByLabel('Recovery answer'), ${JSON.stringify(TYPED)}, { secret: false });
  expect(await valueIs(page, '#answer', ${JSON.stringify(TYPED)})).toBe(true);
});

test('type: masked, typed key by key, input events fire', async ({ page }) => {
  await page.evaluate(() => { window.__inputs = 0; document.getElementById('p').addEventListener('input', () => window.__inputs++); });
  await actions.type(page.getByLabel('Password', { exact: true }), ${JSON.stringify(TYPED)});
  expect(await valueIs(page, '#p', ${JSON.stringify(TYPED)})).toBe(true);
  expect(await page.evaluate(() => window.__inputs)).toBe(${TYPED.length});
});

test('typeOnPage into the focused password input: masked', async ({ page }) => {
  await actions.focus(page.locator('#p'));
  await actions.typeOnPage(page, ${JSON.stringify(TYPED)});
  expect(await valueIs(page, '#p', ${JSON.stringify(TYPED)})).toBe(true);
});

test('typeOnPage into a normal field is shown', async ({ page }) => {
  await actions.focus(page.locator('#u'));
  await actions.typeOnPage(page, ${JSON.stringify(VISIBLE)});
  expect(await valueIs(page, '#u', ${JSON.stringify(VISIBLE)})).toBe(true);
});

test('fillForm: a password field is masked in its error and entered', async ({ page }) => {
  await actions.fillForm(page, { Username: ${JSON.stringify(VISIBLE)}, 'Display name': ${JSON.stringify(TYPED)} });
  expect(await valueIs(page, '#d', ${JSON.stringify(TYPED)})).toBe(true);
});

test('a failing secret fill: neither the error nor the log repeats the value', async ({ page }) => {
  await actions.fill(page.getByLabel('Locked password'), ${JSON.stringify(TYPED)});
});

test('BDD: a value from {{env:...}} is masked even in a plain field', async ({ page, vars, uiScenario }) => {
  const handlers = {};
  const register = (kind) => (pattern, fn) => { handlers[pattern] = fn; };
  registerUiSteps({ Given: register('Given'), When: register('When'), Then: register('Then') });
  await handlers['I fill in {string} with {string}']({ uiScenario, vars }, 'Nickname', '{{env:UI_NESTED_PASSWORD}}');
  expect(await valueIs(page, '#n', ${JSON.stringify(FROM_ENV)})).toBe(true);
  await handlers['I fill in {string} with {string}']({ uiScenario, vars }, 'Username', ${JSON.stringify(VISIBLE)});
});
`;

const CONFIG = "use: { actionTimeout: 2000 }, expect: { timeout: 2000 },";

test.describe('typed secrets never reach step titles, logs or errors', () => {
  let results: Record<string, NestedResult>;
  test.beforeAll(() => {
    results = Object.fromEntries(runPlaywright({ 'secrets.spec.js': SPEC }, CONFIG).map((r) => [r.title, r]));
  });

  const everythingSeen = (r: NestedResult) => [...r.steps, r.stdout, ...r.errors].join('\n');

  test('a password input is masked in titles, Playwright API steps and the log - and the value still arrives', () => {
    const r = results['password input: masked, and the value still arrives'] as NestedResult;
    expect(r.status).toBe('passed');
    expect(everythingSeen(r)).not.toContain(TYPED);
    expect(r.steps.join('\n')).toContain('Fill "***"');
    expect(r.stdout).toContain('Fill "***"');
  });

  test('a normal field is not masked: its value stays in the title, so reports remain useful', () => {
    const r = results['visible: a normal field keeps its value in the title'] as NestedResult;
    expect(r.status).toBe('passed');
    expect(r.steps.join('\n')).toContain(`Fill "${VISIBLE}"`);
    expect(r.stdout).toContain(`Fill "${VISIBLE}"`);
  });

  for (const title of [
    'label looks secret on a plain text input: masked',
    'secret: true on a plain field',
    'secret: false does not guess from the name, but a password input stays masked',
    'type: masked, typed key by key, input events fire',
    'typeOnPage into the focused password input: masked',
    'fillForm: a password field is masked in its error and entered',
  ]) {
    test(title, () => {
      const r = results[title] as NestedResult;
      expect(r.errors.join('\n') || r.status).toBe('passed');
      expect(everythingSeen(r)).not.toContain(TYPED);
    });
  }

  test('typeOnPage into a normal field is shown', () => {
    const r = results['typeOnPage into a normal field is shown'] as NestedResult;
    expect(r.status).toBe('passed');
    expect(r.steps.join('\n')).toContain(`Type "${VISIBLE}" on the page`);
  });

  test('a failing secret fill reports the failure without the value', () => {
    const r = results['a failing secret fill: neither the error nor the log repeats the value'] as NestedResult;
    expect(r.status).toBe('failed');
    expect(r.errors.join('\n')).toMatch(/toBeEditable|disabled/);
    expect(everythingSeen(r)).not.toContain(TYPED);
  });

  test('BDD: a value that came from {{env:...}} is masked even when the field is plain, other values are not', () => {
    const r = results['BDD: a value from {{env:...}} is masked even in a plain field'] as NestedResult;
    expect(r.errors.join('\n') || r.status).toBe('passed');
    expect(everythingSeen(r)).not.toContain(FROM_ENV);
    expect(r.steps.join('\n')).toContain('Fill "***" -> ');
    expect(r.steps.join('\n')).toContain(`Fill "${VISIBLE}"`);
  });
});

test.describe('looksSecret', () => {
  test('matches names that hold credentials, not words that merely contain "pin"', () => {
    for (const name of ['Password', 'user_passwd', 'API key', 'api-key', 'apikey', 'Access token', 'client_secret', 'PIN', 'Enter your pin code', 'one time otp', 'data-testid=login-pin']) {
      expect(looksSecret(name), name).toBe(true);
    }
    for (const name of ['Username', 'Shipping address', 'Spinner', 'Display name', 'Passenger count']) {
      expect(looksSecret(name), name).toBe(false);
    }
  });
});
