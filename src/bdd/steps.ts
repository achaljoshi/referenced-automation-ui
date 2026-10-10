import * as path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { placeholders } from '@automation/referenced-automation-utils';
import * as actions from '../actions';
import * as assertions from '../assertions';
import * as locators from '../locators';
import * as dialogs from '../dialogs/dialogs';
import * as emulation from '../emulation/emulation';
import * as network from '../network/network';
import * as tabs from '../tabs/tabs';
import * as clock from '../clock/clock';
import { guardPage } from '../diagnostics/pageGuard';
import { expectNoAccessibilityViolations } from '../accessibility/axeHelper';
import type { UiScenario } from './scenario';
import type { BddSteps } from './types';

type Vars = placeholders.ScenarioVariables;

/** What the steps need from the test: see ../fixtures/uiFixtures (`vars`, `uiScenario`). */
interface UiStepFixtures {
  vars: Vars;
  uiScenario: UiScenario;
}

/** A role-and-name locator from words in a feature file: `the button "Save"`. Names the valid roles when the word is wrong. */
function byRole(page: Page, roleWord: string, name: string, vars: Vars): Locator {
  const make = (locators.role as unknown as Record<string, ((scope: Page, name?: string) => Locator) | undefined>)[roleWord.toLowerCase()];
  if (!make) throw new Error(`"${roleWord}" is not an ARIA role. Use one of: ${locators.ARIA_ROLES.join(', ')}`);
  return make(page, vars.interpolate(name));
}

const label = (page: Page, text: string, vars: Vars) => locators.byLabel(page, vars.interpolate(text));

/**
 * Business-readable steps for features that drive a web UI. Library-agnostic: pass the Given/When/Then of your BDD tool
 * (playwright-bdd's `createBdd(test)` gives them). The test they run in needs the `vars` and `uiScenario` fixtures
 * (and `page`) - this package's `test` has them.
 *
 *   Given I open the page "/login"
 *   When I fill in "Username" with "ada"
 *   And I fill in "Password" with "{{env:UI_PASSWORD}}"
 *   And I click the button "Log in"
 *   Then I should see the heading "Dashboard"
 *   And I should see "Welcome back"
 *   And the URL contains "/dashboard"
 *
 * Elements are found the way a user finds them - by role and name, by label, by visible text - never by CSS. Every
 * string goes through {{placeholders}} (saved values, {{env:X}}, {{uuid}}, {{random:email}}, {{date:+7d}}). Every
 * step waits for what it needs through Playwright's own auto-waiting: there is deliberately no "I wait N seconds".
 * Pair with `registerDataSteps` for the steps that make and check those values.
 */
export function registerUiSteps({ Given, When, Then }: BddSteps): void {
  // ---- Given: where and how ----

  Given('I open the page {string}', async ({ uiScenario, vars }: UiStepFixtures, url: string) => {
    await actions.goto(uiScenario.page, vars.interpolate(url));
  });

  Given('I use the {word} viewport', async ({ uiScenario }: UiStepFixtures, size: string) => {
    const dimensions = (emulation.breakpoints as Record<string, readonly [number, number]>)[size.toLowerCase()];
    if (!dimensions) throw new Error(`Unknown viewport "${size}". Use one of: ${Object.keys(emulation.breakpoints).join(', ')}`);
    await emulation.setViewport(uiScenario.page, dimensions[0], dimensions[1]);
  });

  Given('the viewport is {int} by {int}', async ({ uiScenario }: UiStepFixtures, width: number, height: number) => {
    await emulation.setViewport(uiScenario.page, width, height);
  });

  Given('the browser uses dark mode', async ({ uiScenario }: UiStepFixtures) => {
    await emulation.emulateMedia(uiScenario.page, { colorScheme: 'dark' });
  });

  Given('the clock is fixed at {string}', async ({ uiScenario, vars }: UiStepFixtures, time: string) => {
    await clock.setFixedTime(uiScenario.page, vars.interpolate(time));
  });

  Given('the request to {string} returns JSON:', async ({ uiScenario, vars }: UiStepFixtures, url: string, docString: string) => {
    await network.mockJson(uiScenario.page, vars.interpolate(url), vars.interpolateDeep(JSON.parse(docString)));
  });

  Given('the request to {string} fails with status {int}', async ({ uiScenario, vars }: UiStepFixtures, url: string, status: number) => {
    await network.mockStatus(uiScenario.page, vars.interpolate(url), status);
  });

  Given('requests to {string} are blocked', async ({ uiScenario, vars }: UiStepFixtures, url: string) => {
    await network.blockResources(uiScenario.page, { urls: [vars.interpolate(url)] });
  });

  Given('I am offline', async ({ uiScenario }: UiStepFixtures) => {
    await network.setOffline(uiScenario.page.context(), true);
  });

  Given('I am back online', async ({ uiScenario }: UiStepFixtures) => {
    await network.setOffline(uiScenario.page.context(), false);
  });

  Given('I accept all dialogs', ({ uiScenario }: UiStepFixtures) => {
    uiScenario.dialogs = dialogs.recordDialogs(uiScenario.page, 'accept');
  });

  Given('I dismiss all dialogs', ({ uiScenario }: UiStepFixtures) => {
    uiScenario.dialogs = dialogs.recordDialogs(uiScenario.page, 'dismiss');
  });

  Given('I watch the page for console errors and failed requests', ({ uiScenario }: UiStepFixtures) => {
    uiScenario.guard = guardPage(uiScenario.page);
  });

  // ---- When: acting like a user ----

  When('I click the {word} {string}', async ({ uiScenario, vars }: UiStepFixtures, role: string, name: string) => {
    await actions.click(byRole(uiScenario.page, role, name, vars));
  });

  When('I click on {string}', async ({ uiScenario, vars }: UiStepFixtures, text: string) => {
    await actions.click(locators.byText(uiScenario.page, vars.interpolate(text)));
  });

  When('I double-click the {word} {string}', async ({ uiScenario, vars }: UiStepFixtures, role: string, name: string) => {
    await actions.dblClick(byRole(uiScenario.page, role, name, vars));
  });

  When('I hover over the {word} {string}', async ({ uiScenario, vars }: UiStepFixtures, role: string, name: string) => {
    await actions.hover(byRole(uiScenario.page, role, name, vars));
  });

  When('I fill in {string} with {string}', async ({ uiScenario, vars }: UiStepFixtures, field: string, value: string) => {
    await actions.fill(label(uiScenario.page, field, vars), vars.interpolate(value));
  });

  When('I fill in the placeholder {string} with {string}', async ({ uiScenario, vars }: UiStepFixtures, placeholder: string, value: string) => {
    await actions.fill(locators.byPlaceholder(uiScenario.page, vars.interpolate(placeholder)), vars.interpolate(value));
  });

  When('I clear {string}', async ({ uiScenario, vars }: UiStepFixtures, field: string) => {
    await actions.clear(label(uiScenario.page, field, vars));
  });

  When('I select {string} from {string}', async ({ uiScenario, vars }: UiStepFixtures, option: string, field: string) => {
    await actions.selectOption(label(uiScenario.page, field, vars), { label: vars.interpolate(option) });
  });

  When('I check {string}', async ({ uiScenario, vars }: UiStepFixtures, field: string) => {
    await actions.check(label(uiScenario.page, field, vars));
  });

  When('I uncheck {string}', async ({ uiScenario, vars }: UiStepFixtures, field: string) => {
    await actions.uncheck(label(uiScenario.page, field, vars));
  });

  When('I press the key {string}', async ({ uiScenario, vars }: UiStepFixtures, key: string) => {
    await actions.pressOnPage(uiScenario.page, vars.interpolate(key));
  });

  When('I upload the file {string} to {string}', async ({ uiScenario, vars }: UiStepFixtures, file: string, field: string) => {
    await actions.uploadFile(label(uiScenario.page, field, vars), path.resolve(vars.interpolate(file)));
  });

  When('I drag {string} onto {string}', async ({ uiScenario, vars }: UiStepFixtures, source: string, target: string) => {
    await actions.dragAndDrop(locators.byText(uiScenario.page, vars.interpolate(source)), locators.byText(uiScenario.page, vars.interpolate(target)));
  });

  When('I scroll to the bottom of the page', async ({ uiScenario }: UiStepFixtures) => {
    await actions.scrollPageTo(uiScenario.page, 'bottom');
  });

  When('I reload the page', async ({ uiScenario }: UiStepFixtures) => {
    await actions.reload(uiScenario.page);
  });

  When('I go back in the browser', async ({ uiScenario }: UiStepFixtures) => {
    await actions.goBack(uiScenario.page);
  });

  When('I click the {word} {string} and switch to the new tab', async ({ uiScenario, vars }: UiStepFixtures, role: string, name: string) => {
    const link = byRole(uiScenario.page, role, name, vars);
    uiScenario.page = await tabs.waitForNewPage(uiScenario.page.context(), () => actions.click(link));
  });

  When('I switch back to the first tab', async ({ uiScenario }: UiStepFixtures) => {
    uiScenario.page = uiScenario.firstPage;
    await tabs.switchToTab(uiScenario.page);
  });

  When('I download the file by clicking the {word} {string}', async ({ uiScenario, vars }: UiStepFixtures, role: string, name: string) => {
    const link = byRole(uiScenario.page, role, name, vars);
    uiScenario.download = await actions.downloadAndRead(uiScenario.page, () => actions.click(link), 'test-results/downloads');
  });

  When('I remember the text of the {word} {string} as {string}', async ({ uiScenario, vars }: UiStepFixtures, role: string, name: string, variable: string) => {
    vars.set(variable, await actions.getText(byRole(uiScenario.page, role, name, vars)));
  });

  // ---- Then: what the user sees ----

  Then('I should see {string}', async ({ uiScenario, vars }: UiStepFixtures, text: string) => {
    await assertions.toBeVisible(locators.byText(uiScenario.page, vars.interpolate(text)).first());
  });

  Then('I should not see {string}', async ({ uiScenario, vars }: UiStepFixtures, text: string) => {
    await assertions.not.toBeVisible(locators.byText(uiScenario.page, vars.interpolate(text)).first());
  });

  Then('I should see the {word} {string}', async ({ uiScenario, vars }: UiStepFixtures, role: string, name: string) => {
    await assertions.toBeVisible(byRole(uiScenario.page, role, name, vars));
  });

  Then('I should not see the {word} {string}', async ({ uiScenario, vars }: UiStepFixtures, role: string, name: string) => {
    await assertions.not.toBeVisible(byRole(uiScenario.page, role, name, vars));
  });

  Then('I should see {int} elements with the role {string}', async ({ uiScenario }: UiStepFixtures, count: number, role: string) => {
    await assertions.toHaveCount(locators.byRole(uiScenario.page, role as locators.AriaRole), count);
  });

  Then('the field {string} has the value {string}', async ({ uiScenario, vars }: UiStepFixtures, field: string, value: string) => {
    await assertions.toHaveValue(label(uiScenario.page, field, vars), vars.interpolate(value));
  });

  Then('the {word} {string} has the text {string}', async ({ uiScenario, vars }: UiStepFixtures, role: string, name: string, text: string) => {
    await assertions.toHaveText(byRole(uiScenario.page, role, name, vars), vars.interpolate(text));
  });

  Then('the {word} {string} contains the text {string}', async ({ uiScenario, vars }: UiStepFixtures, role: string, name: string, text: string) => {
    await assertions.toContainText(byRole(uiScenario.page, role, name, vars), vars.interpolate(text));
  });

  Then('the {word} {string} is enabled', async ({ uiScenario, vars }: UiStepFixtures, role: string, name: string) => {
    await assertions.toBeEnabled(byRole(uiScenario.page, role, name, vars));
  });

  Then('the {word} {string} is disabled', async ({ uiScenario, vars }: UiStepFixtures, role: string, name: string) => {
    await assertions.toBeDisabled(byRole(uiScenario.page, role, name, vars));
  });

  Then('the {word} {string} is checked', async ({ uiScenario, vars }: UiStepFixtures, role: string, name: string) => {
    await assertions.toBeChecked(byRole(uiScenario.page, role, name, vars));
  });

  Then('the {word} {string} is not checked', async ({ uiScenario, vars }: UiStepFixtures, role: string, name: string) => {
    await assertions.not.toBeChecked(byRole(uiScenario.page, role, name, vars));
  });

  Then('the table {string} has a row containing {string}', async ({ uiScenario, vars }: UiStepFixtures, table: string, text: string) => {
    await assertions.toBeVisible(locators.rowWithText(byRole(uiScenario.page, 'table', table, vars), vars.interpolate(text)));
  });

  Then('the page title is {string}', async ({ uiScenario, vars }: UiStepFixtures, title: string) => {
    await assertions.toHaveTitle(uiScenario.page, vars.interpolate(title));
  });

  Then('the URL contains {string}', async ({ uiScenario, vars }: UiStepFixtures, part: string) => {
    const escaped = vars.interpolate(part).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await assertions.toHaveURL(uiScenario.page, new RegExp(escaped));
  });

  Then('the page has no accessibility violations', async ({ uiScenario }: UiStepFixtures) => {
    await expectNoAccessibilityViolations(uiScenario.page);
  });

  Then('the page matches the screenshot {string}', async ({ uiScenario, vars }: UiStepFixtures, name: string) => {
    await assertions.toHaveScreenshot(uiScenario.page, vars.interpolate(name));
  });

  Then('the page has had no console errors or failed requests', ({ uiScenario }: UiStepFixtures) => {
    if (!uiScenario.guard) throw new Error('Nothing was watching: add "Given I watch the page for console errors and failed requests" before the steps being checked');
    uiScenario.guard.expectClean();
  });

  Then('I saw the dialog {string}', ({ uiScenario, vars }: UiStepFixtures, message: string) => {
    if (!uiScenario.dialogs) throw new Error('No dialogs were being recorded: add "Given I accept all dialogs" (or dismiss) first');
    const seen = uiScenario.dialogs.messages();
    if (!seen.includes(vars.interpolate(message))) throw new Error(`Expected a dialog saying "${vars.interpolate(message)}" but saw: ${seen.length > 0 ? seen.map((m) => `"${m}"`).join(', ') : 'none'}`);
  });

  Then('the downloaded file is named {string}', ({ uiScenario, vars }: UiStepFixtures, name: string) => {
    if (!uiScenario.download) throw new Error('Nothing was downloaded: add "When I download the file by clicking ..." first');
    if (uiScenario.download.fileName !== vars.interpolate(name)) throw new Error(`The downloaded file is named "${uiScenario.download.fileName}", expected "${vars.interpolate(name)}"`);
  });

  Then('the downloaded file contains {string}', async ({ uiScenario, vars }: UiStepFixtures, text: string) => {
    if (!uiScenario.download) throw new Error('Nothing was downloaded: add "When I download the file by clicking ..." first');
    const content = await uiScenario.download.text();
    if (!content.includes(vars.interpolate(text))) throw new Error(`The downloaded file does not contain "${vars.interpolate(text)}". It starts: ${content.slice(0, 200)}`);
  });
}
