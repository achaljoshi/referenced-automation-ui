import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { convertCodegen, type ConvertOptions } from '../src/codegen';

const wrap = (body: string, fixtures = 'page') => `import { test, expect } from '@playwright/test';\n\ntest('test', async ({ ${fixtures} }) => {\n${body}\n});\n`;
const convert = (body: string, options: Partial<ConvertOptions> = {}, fixtures = 'page') => convertCodegen(wrap(body, fixtures), { source: 'rec.spec.ts', ...options });
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
    const { spec, warnings, tests } = convertCodegen(code, { source: 'lib.js' });
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
    expect(spec).toContain("import { createLoginPage } from './pages/LoginPage';");
    expect(spec).toContain('const ui = createLoginPage(page);');
    expect(spec).toContain("await actions.fill(ui.usernameTextbox, 'ada');");
    expect(spec).toContain('await actions.fill(ui.passwordField, env.get(\'UI_PASSWORD\'));');
    expect(spec.match(/ui\.logInButton/g)).toHaveLength(2); // the same locator, one member
    expect(spec).toContain('ui.listitemFirst');
    expect(spec).toContain('ui.fileNameElement');
    expect(spec).toContain('ui.welcomeBackAdaLovelaceText');
    expect(spec).toContain('await assertions.toBeVisible(ui.dashboardHeading);');
    expect(spec).not.toMatch(/locators/); // nothing in the spec builds a locator any more
    expect(pageObject?.fileName).toBe('LoginPage.ts');
    expect(pageObject?.code).toContain('export interface LoginPage {');
    expect(pageObject?.code).toContain("usernameTextbox: role.textbox(page, 'Username'),");
    expect(pageObject?.code).toContain("logInButton: role.button(page, 'Log in'),");
    expect(pageObject?.code.match(/logInButton/g)).toHaveLength(2); // interface + factory, once each
  });

  test('page-object members never collide: the same name gets a number, popups keep their locators inline', () => {
    const { spec, pageObject } = convert(`
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const p1Promise = page.waitForEvent('popup');
  await page.getByText('Open').click();
  const p1 = await p1Promise;
  await p1.getByRole('button', { name: 'Save' }).click();`, { pageObjects: true });
    expect(pageObject?.code).toContain('saveButton:');
    expect(pageObject?.code).toContain('saveButton2:');
    expect(spec).toContain("role.button(p1, 'Save')");
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
    expect(fromStdin.stdout).toContain("actions.goto(page, '/x')");

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
