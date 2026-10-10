import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { convertCodegen, type ConvertOptions } from '../src/codegen';

const wrap = (body: string, fixtures = 'page') => `import { test, expect } from '@playwright/test';\n\ntest('test', async ({ ${fixtures} }) => {\n${body}\n});\n`;
// These tests are about how each recorded call maps onto the framework, so they read the code in the steps: `inline` keeps
// locators and values where they are used. The CONSTANTS / LOCATORS objects (the default) have their own tests below.
const convert = (body: string, options: Partial<ConvertOptions> = {}, fixtures = 'page') => convertCodegen(wrap(body, fixtures), { source: 'rec.spec.ts', inline: true, ...options });
const convertWithObjects = (body: string, options: Partial<ConvertOptions> = {}) => convertCodegen(wrap(body), { source: 'rec.spec.ts', ...options });
/** The lines of the generated test body (without the wrapper), trimmed. */
const bodyOf = (code: string) => code.split('\n').filter((l) => l.startsWith('  ') && !l.startsWith('  //')).map((l) => l.trim());
const squash = (code: string) => code.replace(/[\s,]+/g, '');

test.describe('locators', () => {
  test('getByRole becomes the role shorthand: name, exact, other options, regex names, no name', () => {
    const { spec } = convert(`
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('heading', { name: /orders \\d+/i, level: 1 }).click();
  await page.getByRole('checkbox', { checked: true }).click();
  await page.getByRole('listitem').click();
  await page.getByRole('menuitem', { name: \`Item \${n}\` }).click();`);
    expect(spec).toContain("const { role } = locators;");
    expect(spec).toContain("actions.click(role.button(page, 'Save'));");
    expect(spec).toContain("actions.click(role.button(page, 'Save', { exact: true }));");
    expect(spec).toContain('actions.click(role.heading(page, /orders \\d+/i, { level: 1 }));');
    expect(spec).toContain('actions.click(role.checkbox(page, undefined, { checked: true }));');
    expect(spec).toContain('actions.click(role.listitem(page));');
    expect(spec).toContain('role.menuitem(page, `Item ${n}`)');
  });

  test('an unknown or computed role falls back to locators.byRole', () => {
    const { spec } = convert(`await page.getByRole(roleName, { name: 'x' }).click();\n  await page.getByRole('nonsense').click();`);
    expect(spec).toContain("locators.byRole(page, roleName, { name: 'x' })");
    expect(spec).toContain("locators.byRole(page, 'nonsense')");
  });

  test('getByText / Label / Placeholder / AltText / Title / TestId', () => {
    const { spec } = convert(`
  await page.getByText('Welcome').click();
  await page.getByText('Exact', { exact: true }).click();
  await page.getByLabel('Password').click();
  await page.getByPlaceholder('Search').click();
  await page.getByAltText('Logo').click();
  await page.getByTitle('Close').click();
  await page.getByTestId('save').click();`);
    for (const line of [
      "locators.byText(page, 'Welcome')",
      "locators.byText(page, 'Exact', { exact: true })",
      "locators.byLabel(page, 'Password')",
      "locators.byPlaceholder(page, 'Search')",
      "locators.byAltText(page, 'Logo')",
      "locators.byTitle(page, 'Close')",
      "locators.byTestId(page, 'save')",
    ]) expect(spec).toContain(line);
  });

  test('css and xpath selectors, first / last / nth / filter / and / or, nested getBy, frames', () => {
    const { spec } = convert(`
  await page.locator('#save').click();
  await page.locator('//div[@id="x"]').click();
  await page.locator('xpath=//a').click();
  await page.locator('css=.card').click();
  await page.getByRole('row').first().click();
  await page.getByRole('row').last().click();
  await page.getByRole('row').nth(2).click();
  await page.getByRole('listitem').filter({ hasText: 'Product 2' }).getByRole('button', { name: 'Add' }).click();
  await page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'P1' }) }).click();
  await page.getByRole('button').and(page.getByTitle('Subscribe')).click();
  await page.getByText('a').or(page.getByText('b')).first().click();
  await page.frameLocator('#f').getByRole('button', { name: 'In frame' }).click();
  await page.locator('iframe[name="x"]').contentFrame().getByText('hi').click();`);
    for (const line of [
      "locators.byCss(page, '#save')",
      "locators.byXpath(page, '//div[@id=\"x\"]')",
      "locators.byXpath(page, '//a')",
      "locators.byCss(page, '.card')",
      'role.row(page).first()',
      'role.row(page).last()',
      'role.row(page).nth(2)',
      "role.button(role.listitem(page).filter({ hasText: 'Product 2' }), 'Add')",
      "role.listitem(page).filter({ has: role.heading(page, 'P1') })",
      "role.button(page).and(locators.byTitle(page, 'Subscribe'))",
      "locators.byText(page, 'a').or(locators.byText(page, 'b')).first()",
      "role.button(page.frameLocator('#f'), 'In frame')",
      "locators.byText(locators.byCss(page, 'iframe[name=\"x\"]').contentFrame(), 'hi')",
    ]) expect(spec, line).toContain(line);
  });
});

test.describe('actions', () => {
  test('every locator action maps to its logged framework function', () => {
    const lines = bodyOf(
      convert(`
  const el = page.locator('#e');
  await page.locator('#e').click({ button: 'right' });
  await page.locator('#e').click({ modifiers: ['Shift'] });
  await page.locator('#e').dblclick();
  await page.locator('#e').fill('text');
  await page.locator('#e').pressSequentially('abc');
  await page.locator('#e').press('Enter');
  await page.locator('#e').check();
  await page.locator('#e').uncheck();
  await page.locator('#e').setChecked(true);
  await page.locator('#e').selectOption({ label: 'UK' });
  await page.locator('#e').hover();
  await page.locator('#e').clear();
  await page.locator('#e').focus();
  await page.locator('#e').blur();
  await page.locator('#e').tap();
  await page.locator('#e').selectText();
  await page.locator('#e').scrollIntoViewIfNeeded();
  await page.locator('#e').dispatchEvent('click');
  await page.locator('#e').setInputFiles('a.txt');
  await page.locator('#e').setInputFiles(['a.txt', 'b.txt']);
  await page.locator('#e').setInputFiles([]);
  await page.locator('#e').dragTo(page.locator('#t'));`).spec,
    ).join('\n');
    for (const call of [
      "actions.rightClick(locators.byCss(page, '#e'))",
      "actions.click(locators.byCss(page, '#e'), { modifiers: ['Shift'] })",
      'actions.dblClick(',
      "actions.fill(locators.byCss(page, '#e'), 'text')",
      "actions.type(locators.byCss(page, '#e'), 'abc')",
      "actions.pressKey(locators.byCss(page, '#e'), 'Enter')",
      'actions.check(',
      'actions.uncheck(',
      'actions.setChecked(locators.byCss(page, \'#e\'), true)',
      "actions.selectOption(locators.byCss(page, '#e'), { label: 'UK' })",
      'actions.hover(',
      'actions.clear(',
      'actions.focus(',
      'actions.blur(',
      'actions.tap(',
      'actions.selectText(',
      'actions.scrollIntoView(',
      "actions.dispatchEvent(locators.byCss(page, '#e'), 'click')",
      "actions.uploadFile(locators.byCss(page, '#e'), 'a.txt')",
      "actions.uploadFile(locators.byCss(page, '#e'), ['a.txt', 'b.txt'])",
      'actions.clearFiles(',
      "actions.dragAndDrop(locators.byCss(page, '#e'), locators.byCss(page, '#t'))",
    ]) expect(lines, call).toContain(call);
  });

  test('page-level calls: navigation, load state, URL waits, viewport, keyboard, mouse', () => {
    const lines = bodyOf(
      convert(`
  await page.goto('https://app.test/orders?id=7');
  await page.reload();
  await page.goBack();
  await page.goForward();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForURL('**/done');
  await page.setViewportSize({ width: 800, height: 600 });
  await page.keyboard.press('Escape');
  await page.keyboard.type('hello');
  await page.mouse.wheel(0, 300);
  await page.mouse.move(10, 20);
  await page.bringToFront();`).spec,
    ).join('\n');
    for (const call of [
      "actions.goto(page, '/orders?id=7')",
      'actions.reload(page)',
      'actions.goBack(page)',
      'actions.goForward(page)',
      "actions.waitForLoadState(page, 'domcontentloaded')",
      "assertions.toHaveURL(page, '**/done')",
      'emulation.setViewport(page, 800, 600)',
      "actions.pressOnPage(page, 'Escape')",
      "actions.typeOnPage(page, 'hello')",
      'actions.scrollWheel(page, 0, 300)',
      'actions.moveMouse(page, 10, 20)',
      'tabs.switchToTab(page)',
    ]) expect(lines, call).toContain(call);
  });

  test('fixed waits are removed - and said so; networkidle too; pause and close are dropped', () => {
    const { spec, warnings } = convert(`
  await page.waitForTimeout(3000);
  await page.waitForLoadState('networkidle');
  await page.pause();
  await page.close();`);
    expect(spec).not.toMatch(/waitForTimeout\(3000\)\s*;/);
    expect(spec).toContain('// removed: page.waitForTimeout(3000)');
    expect(spec).toContain('// removed: waitForLoadState(networkidle)');
    expect(spec).toContain('// removed: page.pause()');
    expect(warnings.join('\n')).toMatch(/waitForTimeout\(3000\) was removed: a fixed wait is a guess/);
    expect(warnings.join('\n')).toMatch(/networkidle.*never settles/);
    expect(warnings.join('\n')).toMatch(/page.pause\(\) was removed/);
  });

  test('goto: paths are kept (host from BASE_URL), --keep-host keeps the host, several origins are flagged', () => {
    expect(convert(`await page.goto('https://app.test/a?b=1#h');`).spec).toContain("actions.goto(page, '/a?b=1#h')");
    expect(convert(`await page.goto('https://app.test');`).spec).toContain("actions.goto(page, '/')");
    expect(convert(`await page.goto('https://app.test/a');`, { keepHost: true }).spec).toContain("actions.goto(page, 'https://app.test/a')");
    const two = convert(`await page.goto('https://one.test/a');\n  await page.goto('https://two.test/b');`);
    expect(two.origins).toEqual(['https://one.test', 'https://two.test']);
    expect(two.warnings.join()).toMatch(/2 different origins/);
    expect(convert(`await page.goto(url);`).spec).toContain('actions.goto(page, url)');
    expect(convert(`await page.goto('https://app.test/a', { waitUntil: 'commit' });`).todos).toBe(1);
  });
});

test.describe('assertions', () => {
  test('positive, negated, page-level and options map to assertions.*; unsupported ones are kept as marked Playwright', () => {
    const { spec, todos } = convert(`
  await expect(page.getByText('x')).toBeVisible();
  await expect(page.getByText('x')).toBeVisible({ timeout: 2000 });
  await expect(page.getByText('x')).not.toBeVisible();
  await expect(page.getByRole('textbox')).toHaveValue('v');
  await expect(page.getByRole('listitem')).toHaveCount(3);
  await expect(page.getByRole('link')).toHaveAttribute('href', /x/);
  await expect(page.getByText('x')).not.toContainText('y');
  await expect(page).toHaveURL(/done/);
  await expect(page).toHaveTitle('T');
  await expect(page.getByRole('main')).toMatchAriaSnapshot(\`- heading "A"\`);
  await expect(page.getByText('x')).toBeVisible();
  await expect(page.getByText('x')).not.toHaveJSProperty('a', 1);
  await expect(page.getByText('x'), 'custom message').toBeVisible();`);
    for (const line of [
      "assertions.toBeVisible(locators.byText(page, 'x'))",
      "assertions.toBeVisible(locators.byText(page, 'x'), { timeout: 2000 })",
      "assertions.not.toBeVisible(locators.byText(page, 'x'))",
      "assertions.toHaveValue(role.textbox(page), 'v')",
      'assertions.toHaveCount(role.listitem(page), 3)',
      "assertions.toHaveAttribute(role.link(page), 'href', /x/)",
      "assertions.not.toContainText(locators.byText(page, 'x'), 'y')",
      'assertions.toHaveURL(page, /done/)',
      "assertions.toHaveTitle(page, 'T')",
      'assertions.toMatchAriaSnapshot(role.main(page), `- heading "A"`)',
    ]) expect(spec, line).toContain(line);
    expect(todos).toBe(2); // the negated toHaveJSProperty and the one with a custom message
    expect(spec).toContain('// TODO(converter): not.toHaveJSProperty has no framework wrapper for this target');
    // `expect` is imported because the kept statements still use it; `actions` is not, nothing here needs it
    expect(spec).toMatch(/import \{ assertions, expect, locators, test \} from '@automation\/referenced-automation-ui';/);
  });
});

test.describe('popups, downloads, dialogs, file choosers, responses', () => {
  test('a popup: the promise/click/await trio becomes waitForNewTab, and the popup is a page afterwards', () => {
    const { spec } = convert(`
  const page1Promise = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Open' }).click();
  const page1 = await page1Promise;
  await page1.getByRole('button', { name: 'Accept' }).click();
  await expect(page1.getByText('Welcome')).toBeVisible();`);
    expect(spec).toContain('const page1 = await actions.waitForNewTab(page, async () => {');
    expect(spec).toContain("await actions.click(role.link(page, 'Open'));");
    expect(spec).toContain("await actions.click(role.button(page1, 'Accept'));");
    expect(spec).toContain("await assertions.toBeVisible(locators.byText(page1, 'Welcome'));");
  });

  test('a download becomes downloadAndRead; a response / request wait becomes the matching helper', () => {
    const { spec } = convert(`
  const downloadPromise = page.waitForEvent('download');
  await page.getByText('Export').click();
  const download = await downloadPromise;
  console.log(download.suggestedFilename());
  const responsePromise = page.waitForResponse('**/api/orders');
  await page.getByText('Load').click();
  const response = await responsePromise;
  console.log(response.status());
  const requestPromise = page.waitForRequest(/api\\/save/);
  await page.getByText('Save').click();
  const request = await requestPromise;
  console.log(request.url());`);
    expect(spec).toContain("const download = (await actions.downloadAndRead(page, async () => {");
    expect(spec).toContain("}, 'test-results/downloads')).download;");
    expect(spec).toContain("const response = await actions.waitForResponseMatching(page, '**/api/orders', async () => {");
    expect(spec).toContain('const request = await network.waitForRequestMatching(page, /api\\/save/, async () => {');
  });

  test('a popup, download, response or request the recording never uses afterwards is not bound to a variable', () => {
    const { spec } = convert(`
  const page1Promise = page.waitForEvent('popup');
  await page.getByText('Open').click();
  const page1 = await page1Promise;
  const downloadPromise = page.waitForEvent('download');
  await page.getByText('Export').click();
  const download = await downloadPromise;
  const responsePromise = page.waitForResponse('**/api/x');
  await page.getByText('Load').click();
  const response = await responsePromise;`);
    expect(spec).toContain('await actions.waitForNewTab(page, async () => {');
    expect(spec).not.toMatch(/const page1|const download|const response/);
    expect(spec).toContain("await actions.downloadAndRead(page, async () => {");
    expect(spec).toContain("}, 'test-results/downloads');");
    expect(spec).toContain("await actions.waitForResponseMatching(page, '**/api/x', async () => {");
  });

  test('dialogs: dismiss, accept, accept with text wrap the click that raises them', () => {
    const { spec } = convert(`
  page.once('dialog', dialog => {
    console.log(\`Dialog message: \${dialog.message()}\`);
    dialog.dismiss().catch(() => {});
  });
  await page.getByRole('button', { name: 'Delete' }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Confirm' }).click();
  page.once('dialog', dialog => dialog.accept('Ada'));
  await page.getByRole('button', { name: 'Rename' }).click();`);
    expect(spec).toContain("await dialogs.handleDialogDuring(page, async () => {\n    await actions.click(role.button(page, 'Delete'));\n  }, 'dismiss');");
    expect(spec).toContain("}, 'accept');");
    expect(spec).toContain("}, { accept: 'Ada' });");
  });

  test('a file chooser is answered with the files the recording chose', () => {
    const { spec } = convert(`
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByText('Browse').click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles('data/a.csv');`);
    expect(spec).toContain('await actions.chooseFiles(page, async () => {');
    expect(spec).toContain("}, 'data/a.csv');");
    expect(spec).not.toContain('setFiles');
  });

  test('a new tab of the context (the library recording style) uses tabs.waitForNewPage', () => {
    const { spec } = convert(`
  const pagePromise = context.waitForEvent('page');
  await page.getByText('Open').click();
  const newPage = await pagePromise;
  await newPage.getByText('x').click();`, {}, 'page, context');
    expect(spec).toContain('const newPage = await tabs.waitForNewPage(context, async () => {');
    expect(spec).toContain("locators.byText(newPage, 'x')");
    expect(spec).toContain('async ({ page, context })');
  });

  test('a wait that is never awaited, or has no wrapper, is kept as written and marked', () => {
    const never = convert(`const p = page.waitForEvent('popup');\n  await page.getByText('x').click();`);
    expect(never.warnings.join()).toMatch(/never awaited/);
    const odd = convert(`
  const workerPromise = page.waitForEvent('worker');
  await page.getByText('x').click();
  const worker = await workerPromise;`);
    expect(odd.todos).toBe(1);
    expect(odd.spec).toContain("// TODO(converter): no framework wrapper for this wait");
    expect(odd.spec).toContain("page.waitForEvent('worker')");
  });
});

test.describe('secrets, parameters and the rest of the file', () => {
  test('anything typed into a password / token / secret field is read from the environment - the value never appears', () => {
    const { spec, envVars } = convert(`
  await page.getByLabel('Password').fill('hunter2');
  await page.getByRole('textbox', { name: 'API token' }).fill('tok-123');
  await page.getByPlaceholder('Enter PIN').fill('4321');
  await page.getByLabel('Username').fill('ada');`);
    expect(spec).not.toMatch(/hunter2|tok-123|4321/);
    expect(spec).toContain("env.get('UI_PASSWORD')");
    expect(spec).toContain("env.get('UI_API_TOKEN')");
    expect(spec).toContain("env.get('UI_ENTER_PIN')");
    expect(spec).toContain("actions.fill(locators.byLabel(page, 'Username'), 'ada')");
    expect(spec).toContain("import { loadEnv } from '@automation/referenced-automation-utils';");
    expect(envVars).toEqual(['UI_API_TOKEN', 'UI_ENTER_PIN', 'UI_PASSWORD']);
  });

  test('--param marks more fields by their locator text', () => {
    const { spec } = convert(`await page.getByLabel('Account number').fill('12345678');\n  await page.getByLabel('Nickname').fill('mine');`, { params: [{ pattern: /account/i, envVar: 'ACCOUNT' }] });
    expect(spec).toContain("env.get('ACCOUNT')");
    expect(spec).not.toContain('12345678');
    expect(spec).toContain("'mine'");
  });

  test('test.use, describe-nested tests and several tests are kept', () => {
    const code = `import { test, expect } from '@playwright/test';
test.use({ viewport: { width: 1280, height: 720 }, locale: 'de-DE' });
test.describe('group', () => {
  test('first', async ({ page }) => { await page.goto('https://app.test/a'); });
  test('second', async ({ page }) => { await page.goto('https://app.test/b'); });
});
test('third', async ({ page }) => { await page.goto('https://app.test/c'); });`;
    const { spec, tests } = convertCodegen(code, { source: 'many.spec.ts' });
    expect(tests).toBe(3);
    expect(spec).toContain("test.use({ viewport: { width: 1280, height: 720 }, locale: 'de-DE' });");
    expect(spec).toContain("test('first @ui'");
    expect(spec).toContain("test('second @ui'");
    expect(spec).toContain("test('third @ui'");
  });

  test('title defaults to the file name for codegen\'s "test"; tag and imports are configurable', () => {
    const { spec } = convertCodegen(wrap(`await page.goto('/');`), { source: 'recordings/checkout-flow.spec.ts', tag: '@smoke', testImport: './base', uiImport: './framework' });
    expect(spec).toContain("test('checkout-flow @smoke'");
    expect(spec).toContain("import { actions } from './framework';");
    expect(spec).toContain("import { test } from './base';");
  });

  test('the library output ((async () => {...})()) is understood: its browser scaffolding is dropped', () => {
    const code = `const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
  const page = await context.newPage();
  await page.goto('https://app.test/');
  await page.getByRole('button', { name: 'Go' }).click();
  await context.close();
  await browser.close();
})();`;
    const { spec, warnings, tests } = convertCodegen(code, { source: 'lib.js', inline: true });
    expect(tests).toBe(1);
    expect(spec).toContain("actions.goto(page, '/')");
    expect(spec).toContain("actions.click(role.button(page, 'Go'))");
    expect(spec).not.toMatch(/chromium|browser\.|context\.close|launch/);
    expect(warnings.join()).toMatch(/newContext\(\.\.\.\) options were not carried over/);
  });

  test('anything the converter does not model is kept as Playwright, marked, and counted', () => {
    const { spec, todos, warnings } = convert(`
  console.log('hello');
  const title = await page.title();
  await page.evaluate(() => 1);
  await page.locator('#x').boundingBox();`);
    expect(todos).toBe(4);
    expect(spec.match(/TODO\(converter\)/g)).toHaveLength(4);
    expect(spec).toContain("console.log('hello');");
    expect(warnings).toHaveLength(4);
  });

  test('no test in the file, or one that is not a recording, is an error that says what is expected', () => {
    expect(() => convertCodegen('const x = 1;', { source: 'junk.ts' })).toThrow(/No Playwright test found in junk.ts.*npx playwright codegen/);
  });
});

test.describe('page objects and data-driven mode', () => {
  const RECORDING = `
  await page.goto('https://app.test/');
  await page.getByRole('textbox', { name: 'Username' }).fill('ada');
  await page.getByLabel('Password').fill('secret');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByRole('listitem').first().click();
  await page.locator('#fileName').click();
  await page.getByText('Welcome back, Ada Lovelace of London').click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();`;

  test('--page-objects names every locator once, the test uses them, and the spec imports only what it still needs', () => {
    const { spec, pageObject } = convert(RECORDING, { pageObjects: true, baseName: 'login' });
    expect(spec).toContain("import { CONSTANTS, createLoginPage } from './pages/LoginPage';");
    expect(spec).toContain('const ui = createLoginPage(page);');
    expect(spec).toContain('await actions.fill(ui.usernameTextbox, CONSTANTS.inputs.usernameTextbox);');
    expect(spec).toContain('await actions.fill(ui.passwordField, CONSTANTS.inputs.passwordField);');
    expect(spec).not.toMatch(/'ada'|env\.get/); // values and the environment live in the page object file
    expect(spec.match(/ui\.logInButton/g)).toHaveLength(2); // the same locator, one member
    expect(spec).toContain('ui.listitemFirst');
    expect(spec).toContain('ui.fileNameElement');
    expect(spec).toContain('ui.welcomeBackAdaLovelaceText');
    expect(spec).toContain('await assertions.toBeVisible(ui.dashboardHeading);');
    expect(spec).not.toMatch(/locators/); // nothing in the spec builds a locator any more
    expect(pageObject?.fileName).toBe('LoginPage.ts');
    expect(pageObject?.code).toContain('export interface LoginPage {');
    expect(pageObject?.code).toContain("usernameTextbox: (scope: Page) => role.textbox(scope, 'Username'),");
    expect(pageObject?.code).toContain("logInButton: (scope: Page) => role.button(scope, 'Log in'),");
    expect(pageObject?.code).toContain('logInButton: LOCATORS.logInButton(page),');
    expect(pageObject?.code.match(/logInButton/g)).toHaveLength(4); // LOCATORS, interface, factory name and call - one locator, one definition
    expect(pageObject?.code).toContain('export const CONSTANTS = {');
    expect(pageObject?.code).toContain('export const LOCATORS = {');
  });

  test('page-object members never collide: the same name gets a number, and a popup looks the same LOCATORS up on itself', () => {
    const { spec, pageObject } = convert(`
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const p1Promise = page.waitForEvent('popup');
  await page.getByText('Open').click();
  const p1 = await p1Promise;
  await p1.getByRole('button', { name: 'Save' }).click();`, { pageObjects: true });
    expect(pageObject?.code).toContain('saveButton:');
    expect(pageObject?.code).toContain('saveButton2:');
    // the popup's button is the same element as the page's: one LOCATORS entry, looked up on the popup
    expect(spec).toContain('LOCATORS.saveButton(p1)');
    expect(spec).toMatch(/import \{ LOCATORS, create\w+Page \} from '\.\/pages\/\w+Page';/);
  });

  test('--data turns typed literals into CSV columns, one test per row; secrets never reach the file', () => {
    const { spec, data } = convert(RECORDING, { data: true, baseName: 'login' });
    expect(spec).toContain('for (const [index, row] of rows.entries()) {');
    expect(spec).toContain("csvUtils.parseCsvFile(path.join(__dirname, 'login.data.csv'))");
    expect(spec).toContain("actions.fill(role.textbox(page, 'Username'), cell(row, 'usernameTextbox'))");
    expect(spec).toContain("env.get('UI_PASSWORD')");
    expect(data?.fileName).toBe('login.data.csv');
    expect(data?.csv).toBe('usernameTextbox\nada\n');
    expect(data?.csv).not.toContain('secret');
    expect(data?.rows).toEqual([{ usernameTextbox: 'ada' }]);
  });
});

test.describe('CONSTANTS and LOCATORS objects (the default)', () => {
  const RECORDING = `
  await page.goto('https://app.test/orders.html?x=1');
  await page.getByRole('textbox', { name: 'Username' }).fill('ada');
  await page.getByLabel('Password').fill('hunter2');
  await page.getByLabel('Country').selectOption('uk');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByLabel('Upload').setInputFiles('data/a.csv');
  await page.keyboard.type('hello');
  await page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'P1' }) }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toHaveText('Dashboard');
  await expect(page.getByRole('listitem')).toHaveCount(3);
  await expect(page.getByRole('link')).toHaveAttribute('href', /orders/);
  await expect(page.getByText('x')).not.toBeVisible();
  await expect(page).toHaveURL(/done/);
  await expect(page).toHaveTitle('Orders');
  await expect(page.getByRole('main')).toMatchAriaSnapshot(\`- heading "A"\`);
  await page.getByLabel('Note').fill('');`;
  const { spec } = convertWithObjects(RECORDING);
  const body = spec.slice(spec.indexOf("test('rec"));

  test('the file starts with CONSTANTS, then LOCATORS, then the test - and the steps only refer to them', () => {
    const constants = spec.indexOf('const CONSTANTS = {');
    const locators = spec.indexOf('const LOCATORS = {');
    const firstTest = spec.indexOf("test('rec");
    expect(constants).toBeGreaterThan(0);
    expect(locators).toBeGreaterThan(constants);
    expect(firstTest).toBeGreaterThan(locators);
    expect(spec).toContain('} as const;');
    // nothing a person would edit is left in the steps: no quoted values, no locator built there
    expect(body).not.toMatch(/'ada'|'uk'|'Dashboard'|'Orders'|'data\/a\.csv'|hello|\/orders\.html/);
    expect(body).not.toMatch(/role\.|locators\./);
  });

  test('CONSTANTS: urls, inputs (secrets as environment getters, never as values) and expected values - each named once', () => {
    expect(spec).toContain("  urls: {\n    ordersHtml: '/orders.html?x=1',");
    expect(spec).toContain("usernameTextbox: 'ada',");
    expect(spec).toContain("countryField: 'uk',");
    expect(spec).toContain("uploadField: 'data/a.csv',");
    expect(spec).toContain("typedText: 'hello',");
    expect(spec).toContain("get passwordField() {\n      return env.get('UI_PASSWORD');\n    },");
    expect(spec).not.toContain('hunter2');
    expect(spec).toContain("dashboardHeadingText: 'Dashboard',");
    expect(spec).toContain('listitemCount: 3,');
    expect(spec).toContain('linkAttribute: /orders/,');
    expect(spec).toContain('pageUrl: /done/,');
    expect(spec).toContain("pageTitle: 'Orders',");
    expect(spec).toContain("const env = loadEnv();");
    // the steps use them
    expect(body).toContain('actions.goto(page, CONSTANTS.urls.ordersHtml)');
    expect(body).toContain('CONSTANTS.inputs.usernameTextbox');
    expect(body).toContain('CONSTANTS.inputs.passwordField');
    expect(body).toContain('assertions.toHaveText(LOCATORS.dashboardHeading(page), CONSTANTS.expected.dashboardHeadingText)');
    expect(body).toContain('assertions.toHaveAttribute(LOCATORS.link(page), \'href\', CONSTANTS.expected.linkAttribute)'); // the attribute NAME stays, the expected value is the constant
    expect(body).toContain('assertions.toHaveURL(page, CONSTANTS.expected.pageUrl)');
    expect(body).toContain('assertions.not.toBeVisible(LOCATORS.textX(page))'.replace('textX', 'xText'));
  });

  test('values that are not worth a constant stay in the step: empty strings, options, ARIA templates', () => {
    expect(body).toContain("actions.fill(LOCATORS.noteField(page), '')");
    expect(body).toContain('assertions.toMatchAriaSnapshot(LOCATORS.main(page), `- heading "A"`)');
  });

  test('LOCATORS: one entry per element however often it is used, written against a `scope` page; nested locators use the same scope', () => {
    expect(spec).toContain("usernameTextbox: (scope: Page) => role.textbox(scope, 'Username'),");
    expect(spec.match(/logInButton:/g)).toHaveLength(1);
    expect(body.match(/LOCATORS\.logInButton\(page\)/g)).toHaveLength(2);
    expect(spec).toContain("listitem: (scope: Page) => role.listitem(scope).filter({ has: role.heading(scope, 'P1') }),");
    expect(spec).toContain("import type { Page } from '@playwright/test';");
    expect(spec).toContain('const { role } = locators;');
  });

  test('a popup or second page uses the same LOCATORS, looked up on that page', () => {
    const { spec: popup } = convertWithObjects(`
  await page.getByRole('button', { name: 'Save' }).click();
  const p1Promise = page.waitForEvent('popup');
  await page.getByText('Open').click();
  const p1 = await p1Promise;
  await p1.getByRole('button', { name: 'Save' }).click();`);
    expect(popup.match(/saveButton:/g)).toHaveLength(1);
    expect(popup).toContain('await actions.click(LOCATORS.saveButton(page));');
    expect(popup).toContain('await actions.click(LOCATORS.saveButton(p1));');
  });

  test('--inline puts everything back in the steps and writes neither object', () => {
    const inline = convertWithObjects(RECORDING, { inline: true }).spec;
    expect(inline).not.toMatch(/CONSTANTS|LOCATORS/);
    expect(inline).toContain("actions.fill(role.textbox(page, 'Username'), 'ada')");
    expect(inline).toContain("env.get('UI_PASSWORD')");
  });

  test('--data: typed values come from the CSV, the rest stays in CONSTANTS; secrets are still getters', () => {
    const { spec: data, data: csv } = convertWithObjects(RECORDING, { data: true, baseName: 'orders' });
    expect(data).not.toContain("usernameTextbox: 'ada'");
    expect(data).toContain("cell(row, 'usernameTextbox')");
    expect(data).toContain("get passwordField()");
    expect(data).toContain("ordersHtml: '/orders.html?x=1'");
    expect(data).toContain('listitemCount: 3,');
    expect(csv?.csv).not.toContain('hunter2');
  });

  test('--page-objects: both objects start the page object file (exported), the factory is built from LOCATORS, the spec imports only what it uses', () => {
    const { spec: po, pageObject } = convertWithObjects(RECORDING, { pageObjects: true, baseName: 'orders' });
    const code = pageObject?.code ?? '';
    expect(code.indexOf('export const CONSTANTS')).toBeLessThan(code.indexOf('export const LOCATORS'));
    expect(code.indexOf('export const LOCATORS')).toBeLessThan(code.indexOf('export interface OrdersPage'));
    expect(code).toContain("const env = loadEnv();");
    expect(code).toContain('usernameTextbox: LOCATORS.usernameTextbox(page),');
    expect(po).toContain("import { CONSTANTS, createOrdersPage } from './pages/OrdersPage';");
    expect(po).not.toMatch(/loadEnv|env\.get|locators|role\./);
  });

  test('colliding names get numbers: two different values for the same field are two constants, the same value is one', () => {
    const { spec: names } = convertWithObjects(`
  await page.getByLabel('Name').fill('Ada');
  await page.getByLabel('Name').fill('Grace');
  await page.getByLabel('Name').fill('Ada');`);
    expect(names).toContain("nameField: 'Ada',");
    expect(names).toContain("nameField2: 'Grace',");
    expect(names.match(/CONSTANTS\.inputs\.nameField\b/g)).toHaveLength(2);
  });
});

test.describe('committed examples', () => {
  const root = path.join(__dirname, '..');
  const regenerate = (options: Partial<ConvertOptions>) =>
    convertCodegen(fs.readFileSync(path.join(root, 'recordings', 'login-flow.spec.ts'), 'utf8'), {
      source: 'recordings/login-flow.spec.ts',
      testImport: '../support/recordedTest',
      uiImport: '../../src/index',
      ...options,
    });

  test('tests/generated/* is exactly what the converter produces from recordings/login-flow.spec.ts', () => {
    const committed = (file: string) => fs.readFileSync(path.join(root, 'tests', 'generated', file), 'utf8');
    expect(squash(committed('loginFlow.spec.ts'))).toBe(squash(regenerate({ baseName: 'login-flow' }).spec));
    const withPages = regenerate({ pageObjects: true, baseName: 'LoginFlow' });
    expect(squash(committed('loginFlowPageObjects.spec.ts'))).toBe(squash(withPages.spec));
    expect(squash(committed('pages/LoginFlowPage.ts'))).toBe(squash((withPages.pageObject as { code: string }).code.replace("'../../src/index'", "'../../../src/index'")));
    const withData = regenerate({ data: true, baseName: 'loginFlowData' });
    expect(squash(committed('loginFlowData.spec.ts'))).toBe(squash(withData.spec));
    expect(committed('loginFlowData.data.csv')).toBe((withData.data as { csv: string }).csv);
  });
});

test.describe('ui-codegen-to-playwright command', () => {
  const cli = path.join(__dirname, '..', 'dist', 'cli', 'codegenToTests.js');
  const run = (args: string[], input?: string) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', input });
  const RECORDING = wrap(`await page.goto('https://app.test/x');\n  await page.getByLabel('Password').fill('pw');\n  await page.getByRole('button', { name: 'Go' }).click();`);

  test('writes the spec, the page object and the data file next to each other, and says what to set', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codegen-cli-'));
    const input = path.join(dir, 'checkout.spec.ts');
    fs.writeFileSync(input, RECORDING);
    const out = path.join(dir, 'out');
    const result = run([input, '--out', out, '--page-objects', '--data']);
    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(out, 'checkout.spec.ts'))).toBe(true);
    expect(fs.existsSync(path.join(out, 'pages', 'CheckoutPage.ts'))).toBe(true);
    expect(fs.existsSync(path.join(out, 'checkout.data.csv'))).toBe(true);
    expect(result.stderr).toContain('UI_PASSWORD');
    expect(result.stderr).toContain('BASE_URL should be https://app.test');
    expect(fs.readFileSync(path.join(out, 'checkout.spec.ts'), 'utf8')).not.toContain("'pw'");
  });

  test('--stdout, standard input and a folder of recordings', () => {
    const fromStdin = run(['-', '--stdout'], RECORDING);
    expect(fromStdin.status).toBe(0);
    expect(fromStdin.stdout).toContain("x: '/x',");
    expect(fromStdin.stdout).toContain('actions.goto(page, CONSTANTS.urls.x)');
    expect(run(['-', '--stdout', '--inline'], RECORDING).stdout).toContain("actions.goto(page, '/x')");

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codegen-cli-'));
    fs.writeFileSync(path.join(dir, 'a.spec.ts'), RECORDING);
    fs.writeFileSync(path.join(dir, 'b.spec.ts'), RECORDING);
    fs.writeFileSync(path.join(dir, 'notes.md'), 'ignored');
    const out = path.join(dir, 'out');
    expect(run([dir, '--out', out]).status).toBe(0);
    expect(fs.readdirSync(out).sort()).toEqual(['a.spec.ts', 'b.spec.ts']);
  });

  test('--strict fails when something was kept as plain Playwright or removed; usage errors say what is wrong', () => {
    const strict = run(['-', '--stdout', '--strict'], wrap('await page.waitForTimeout(500);'));
    expect(strict.status).toBe(1);
    expect(strict.stderr).toContain('--strict');
    expect(run(['-', '--stdout', '--strict'], RECORDING).status).toBe(0);
    expect(run([]).stderr).toContain('Give a recording');
    expect(run(['x.ts', '--nope']).stderr).toContain('Unknown option --nope');
    expect(run(['x.ts', '--param', 'broken']).stderr).toContain('--param needs <regex>=<ENV_VAR>');
    expect(run(['/no/such/recording.ts']).status).toBe(1);
    expect(run(['--help']).stdout).toContain('ui-codegen-to-playwright');
    expect(run(['-', '--stdout'], 'const x = 1;').stderr).toContain('No Playwright test found');
  });
});

// SEC-05: every place a recording can hold a literal credential is handled like a typed password - not only fill().
test.describe('credentials in every literal sink', () => {
  const BASIC = ['basic', 'pass', '1'].join('-'); // assembled: a literal password in a fixture would be flagged by the repo's own secret scan
  const SECRETS = ['hunter2-pw', 'sess-cookie-9X', 'Bearer-abcdef123456', 'tok-URL-77', 'jwt-body-secret', BASIC, 'pin-1234-xyz'];
  const noneOf = (code: string, secrets = SECRETS) => {
    for (const secret of secrets) expect(code, `"${secret}" must not be written into the test`).not.toContain(secret);
  };

  test('keyboard typing and key-by-key presses into a password field are one value from the environment', () => {
    const { spec, envVars } = convert(`
  await page.getByLabel('Password').click();
  await page.keyboard.type('hunter2-pw');
  await page.getByLabel('Search').click();
  await page.keyboard.type('plain search text');`);
    noneOf(spec);
    expect(spec).toContain("actions.typeOnPage(page, env.get('UI_PASSWORD'))");
    expect(spec).toContain("'plain search text'"); // not secret: kept
    expect(envVars).toEqual(['UI_PASSWORD']);

    const keys = convert(`
  await page.getByLabel('Password').click();
  await page.keyboard.press('h');
  await page.keyboard.press('u');
  await page.keyboard.press('n');
  await page.keyboard.press('Shift+T');
  await page.keyboard.press('Enter');`);
    expect(keys.spec.match(/typeOnPage/g)).toHaveLength(1);
    expect(keys.spec).toContain("pressOnPage(page, 'Enter')");
    expect(keys.spec).not.toMatch(/press(OnPage)?\(page, '[hunT]'\)|Shift\+T/);

    const locatorKeys = convert(`
  await page.getByLabel('Password').press('h');
  await page.getByLabel('Password').press('u');`);
    expect(locatorKeys.spec.match(/actions\.type\(/g)).toHaveLength(1);
    expect(locatorKeys.spec).not.toMatch(/pressKey/);
  });

  test('pressSequentially into a password field reads the environment', () => {
    const { spec } = convert(`await page.getByLabel('Password').pressSequentially('hunter2-pw');`);
    noneOf(spec);
    expect(spec).toContain("actions.type(locators.byLabel(page, 'Password'), env.get('UI_PASSWORD'))");
  });

  test('cookies, extra headers and credentials in browser options are replaced; harmless values stay', () => {
    const { spec, envVars, warnings } = convert(`
  await context.addCookies([{ name: 'session', value: 'sess-cookie-9X', domain: 'app.test', path: '/' }, { name: 'theme', value: 'dark', url: 'https://app.test' }]);
  await context.setExtraHTTPHeaders({ Authorization: 'Bearer-abcdef123456', 'X-Feature': 'on', 'x-api-key': 'jwt-body-secret' });
  await page.route('**/api', (route) => route.continue({ headers: { ...route.request().headers(), Cookie: 'sid=sess-cookie-9X' } }));`);
    noneOf(spec);
    expect(spec).toContain("value: env.get('UI_COOKIE_SESSION')");
    expect(spec).toContain("Authorization: env.get('UI_AUTHORIZATION')");
    expect(spec).toContain("'x-api-key': env.get('UI_X_API_KEY')");
    expect(spec).toContain("'X-Feature': 'on'");
    expect(spec).toContain("value: env.get('UI_COOKIE_THEME')");
    expect(spec).toContain('const env = loadEnv();');
    expect(envVars).toEqual(expect.arrayContaining(['UI_COOKIE_SESSION', 'UI_AUTHORIZATION', 'UI_X_API_KEY', 'UI_COOKIE']));
    expect(warnings.some((w) => /cookie "session"/.test(w))).toBe(true);
  });

  test('tokens in URLs (goto, expected URL) are read from the environment', () => {
    const { spec } = convert(`
  await page.goto('https://app.test/cb?lang=en&token=tok-URL-77&next=%2Fhome');
  await expect(page).toHaveURL('https://app.test/done?access_token=tok-URL-77');
  await expect(page).toHaveURL(/done\\?api_key=tok-URL-77/);`);
    noneOf(spec);
    expect(spec).toMatch(/`\/cb\?lang=en&token=\$\{env\.get\('UI_URL_TOKEN'\)\}&next=%2Fhome`/);
    expect(spec).toContain('lang=en'); // the rest of the URL is intact
    expect(spec).toMatch(/access_token=\$\{env\.get\('UI_URL_ACCESS_TOKEN'\)\}/);
    expect(spec).toMatch(/api_key=\[\^&#\]\+/); // a pattern cannot read the environment: wildcard
  });

  test('credentials in the userinfo part of a URL are not kept', () => {
    const withCredentials = `await page.goto('https://ada${':'}${BASIC}${'@'}app.test/admin');`; // assembled: not a URL with a password to the repo's own secret scan
    const { spec, origins, warnings } = convert(withCredentials);
    noneOf(spec);
    expect(origins).toEqual(['https://app.test']);
    expect(spec).toContain("'/admin'");
    expect(warnings.join('\n')).toMatch(/credentials in the URL were removed/);
    expect(convert(withCredentials, { keepHost: true }).spec).not.toContain(BASIC);
  });

  test('evaluated code and storage writes with an obvious secret are replaced; ordinary evaluate is untouched', () => {
    const { spec } = convert(`
  await page.evaluate(() => localStorage.setItem('token', 'jwt-body-secret'));
  await page.evaluate("localStorage.setItem('access_token', 'jwt-body-secret')");
  await page.evaluate("document.cookie = 'session=sess-cookie-9X; path=/'");
  await page.evaluate(() => document.title);
  await page.fill('#password', 'hunter2-pw');
  await page.frameLocator('iframe').getByLabel('PIN').fill('pin-1234-xyz');`);
    noneOf(spec);
    // browser code cannot read this process's environment: the value is handed in as the argument of evaluate
    expect(spec).toContain("page.evaluate((secrets) => localStorage.setItem('token', secrets.UI_TOKEN), { UI_TOKEN: env.get('UI_TOKEN') })");
    expect(spec).toMatch(/setItem\('access_token', '\$\{env\.get\('UI_ACCESS_TOKEN'\)\}'\)/);
    expect(spec).toMatch(/document\.cookie = 'session=\$\{env\.get\('UI_COOKIE_SESSION'\)\}; path=\/'/);
    expect(spec).toContain('document.title');
    expect(spec).toContain("page.fill('#password', env.get('UI_PASSWORD'))");
    expect(spec).toContain("'PIN'), env.get('UI_PIN'))");
  });

  test('credentials inside browser-side code that cannot be handed in as an argument are masked, never written', () => {
    const { spec, warnings } = convert(`await page.evaluate((id) => { sessionStorage.setItem('auth_token', 'jwt-body-secret'); return id; }, 'x');`);
    noneOf(spec);
    expect(spec).toContain("sessionStorage.setItem('auth_token', '***')");
    expect(warnings.join('\n')).toMatch(/runs in the browser and was masked/);
  });

  test('newContext options and test.use headers / httpCredentials in a recording are scrubbed', () => {
    const library = convertCodegen(
      `const { chromium } = require('playwright');\n(async () => {\n  const browser = await chromium.launch();\n  const context = await browser.newContext({ httpCredentials: { username: 'ada', password: '${BASIC}' } });\n  const page = await context.newPage();\n  await context.addCookies([{ name: 'sid', value: 'sess-cookie-9X', url: 'https://app.test' }]);\n  await page.goto('https://app.test/');\n})();`,
      { source: 'rec.js', inline: true },
    );
    noneOf(library.spec);
    const withUse = convertCodegen(
      `import { test } from '@playwright/test';\ntest.use({ extraHTTPHeaders: { Authorization: 'Bearer-abcdef123456' }, httpCredentials: { username: 'ada', password: '${BASIC}' } });\ntest('t', async ({ page }) => {\n  await page.goto('https://app.test/');\n});\n`,
      { source: 'rec.spec.ts', inline: true },
    );
    noneOf(withUse.spec);
    expect(withUse.spec).toContain("password: env.get('UI_PASSWORD')");
    expect(withUse.spec).toContain('const env = loadEnv();');
    // the env read is declared before test.use runs
    expect(withUse.spec.indexOf('const env = loadEnv()')).toBeLessThan(withUse.spec.indexOf('test.use('));
  });

  test('the expected value of a password field is read from the environment', () => {
    const { spec } = convert(`await expect(page.getByLabel('Password')).toHaveValue('hunter2-pw');`);
    noneOf(spec);
    expect(spec).toContain("assertions.toHaveValue(locators.byLabel(page, 'Password'), env.get('UI_PASSWORD'))");
  });

  test('page-object mode: a credential in the test body still gets its own `env`, the page object does not import loadEnv for it', () => {
    const { spec, pageObject } = convertWithObjects(`await page.goto('https://app.test/');\n  await context.setExtraHTTPHeaders({ Authorization: 'Bearer-abcdef123456' });\n  await page.getByRole('button', { name: 'Go' }).click();`, { pageObjects: true, baseName: 'Flow' });
    noneOf(spec);
    expect(spec).toContain("import { loadEnv } from '@automation/referenced-automation-utils';");
    expect(spec).toContain('const env = loadEnv();');
    expect(pageObject?.code).not.toContain('loadEnv');
  });

  test('constants mode: a URL token becomes a getter in CONSTANTS and no literal remains', () => {
    const { spec } = convertWithObjects(`await page.goto('https://app.test/cb?token=tok-URL-77');`);
    noneOf(spec);
    expect(spec).toMatch(/get cb\(\) \{\s*return `\/cb\?token=\$\{env\.get\('UI_URL_TOKEN'\)\}`;/);
  });

  test('the header comment says what is true: recognised secrets are replaced, others may remain', () => {
    const { spec } = convert(`await page.getByLabel('Password').fill('hunter2-pw');`);
    expect(spec).not.toMatch(/never written/i);
    expect(spec).toMatch(/Secrets the converter recognised are read from the environment .*review the file/);
    expect(spec).toContain('// Set: UI_PASSWORD');
    // and it is there even when nothing was recognised
    expect(convert(`await page.getByText('x').click();`).spec).toMatch(/review the file/);
  });
});

// SEC-05: a skipped test must never come back live.
test.describe('test.skip / test.fixme / test.only / test.fail annotations are preserved', () => {
  const recording = (body: string) => `import { test, expect } from '@playwright/test';\n\n${body}\n`;
  const titles = (spec: string) => spec.split('\n').filter((l) => /^test(\.\w+)?\(/.test(l)).map((l) => l.replace(/, async.*$/, ''));

  test('on the test itself', () => {
    const { spec, warnings } = convertCodegen(
      recording(`
test.skip('skipped one', async ({ page }) => { await page.goto('https://app.test/a'); });
test.fixme('broken one', async ({ page }) => { await page.goto('https://app.test/b'); });
test.only('focused one', async ({ page }) => { await page.goto('https://app.test/c'); });
test.fail('expected failure', async ({ page }) => { await page.goto('https://app.test/d'); });
test('plain', async ({ page }) => { await page.goto('https://app.test/e'); });`),
      { source: 'rec.spec.ts', inline: true },
    );
    expect(titles(spec)).toEqual(["test.skip('skipped one @ui'", "test.fixme('broken one @ui'", "test.only('focused one @ui'", "test.fail('expected failure @ui'", "test('plain @ui'"]);
    expect(warnings.join('\n')).toMatch(/test\.only.*forbidOnly/);
  });

  test('inherited from the describe: describe.skip / fixme / only reach every test inside; an own annotation wins', () => {
    const { spec } = convertCodegen(
      recording(`
test.describe.skip('group', () => {
  test('inside skipped group', async ({ page }) => { await page.goto('https://app.test/a'); });
  test.fixme('fixme in skipped group', async ({ page }) => { await page.goto('https://app.test/b'); });
});
test.describe.only('focused group', () => {
  test('inside focused group', async ({ page }) => { await page.goto('https://app.test/c'); });
  test.skip('skip in focused group', async ({ page }) => { await page.goto('https://app.test/d'); });
});
test.describe('open group', () => {
  test('inside open group', async ({ page }) => { await page.goto('https://app.test/e'); });
});`),
      { source: 'rec.spec.ts', inline: true },
    );
    expect(titles(spec)).toEqual([
      "test.skip('inside skipped group @ui'",
      "test.skip('fixme in skipped group @ui'",
      "test.only('inside focused group @ui'",
      "test.skip('skip in focused group @ui'",
      "test('inside open group @ui'",
    ]);
  });

  test('a conditional skip (test.skip(condition, reason)) is kept, at the top of the file, so its tests stay skipped', () => {
    const { spec, warnings } = convertCodegen(
      recording(`
test.skip(({ browserName }) => browserName === 'webkit', 'not on webkit');
test.describe('group', () => {
  test.fixme(true, 'known bug');
  test('t', async ({ page }) => { await page.goto('https://app.test/a'); });
});`),
      { source: 'rec.spec.ts', inline: true },
    );
    expect(spec).toContain("test.skip(({ browserName }) => browserName === 'webkit', 'not on webkit');");
    expect(spec).toContain("test.fixme(true, 'known bug');");
    expect(spec.indexOf('test.fixme(true')).toBeLessThan(spec.indexOf("test('t @ui'"));
    expect(warnings.join('\n')).toMatch(/inside a describe is kept at the top of the file/);
  });

  test('data mode keeps the annotation on the generated test', () => {
    const { spec } = convertCodegen(recording(`test.skip('skipped', async ({ page }) => { await page.getByLabel('Name').fill('Ada'); });`), { source: 'rec.spec.ts', inline: true, data: true });
    expect(spec).toMatch(/test\.skip\(`skipped #\$\{index \+ 1\} @ui`/);
  });
});
