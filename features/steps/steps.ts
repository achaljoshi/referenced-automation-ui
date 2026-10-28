import { expect } from '@playwright/test';
import type { DataTable } from 'playwright-bdd';
import { createBdd } from 'playwright-bdd';
import { actions, assertions, locators, tabs } from '../../src';
import { expectNoAccessibilityViolations } from '../../src/accessibility/axeHelper';
import { registerDataSteps, registerUiSteps } from '../../src/bdd';
import { test } from './fixtures';

// The vocabulary shared by every project ("I click the button ...", "I should see the heading ...", "I set the variable ...")
// lives in the package. Add this project's own steps below, using the same Given/When/Then.
const { Given, When, Then } = createBdd(test);
registerDataSteps({ Given, Then });
registerUiSteps({ Given, When, Then });

// ---- This project's own steps ----

/** The parts of the fixture page a scan can be limited to, by the name a person would use. */
const SECTIONS: Record<string, string> = { Dashboard: '#dashboard-section' };

Given('the sample app is running', async ({ sampleApp, vars }) => {
  vars.set('sampleApp', sampleApp.url);
});

When('I click the {word} {string} in the frame {string}', async ({ uiScenario, vars }, roleWord: string, name: string, frameTitle: string) => {
  const make = (locators.role as unknown as Record<string, ((scope: unknown, name?: string) => ReturnType<typeof locators.role.button>) | undefined>)[roleWord.toLowerCase()];
  if (!make) throw new Error(`"${roleWord}" is not an ARIA role. Use one of: ${locators.ARIA_ROLES.join(', ')}`);
  await actions.click(make(actions.frame(uiScenario.page, `iframe[title=${JSON.stringify(vars.interpolate(frameTitle))}]`), vars.interpolate(name)));
});

Then('the paragraph in the frame {string} reads {string}', async ({ uiScenario, vars }, frameTitle: string, text: string) => {
  const frame = actions.frame(uiScenario.page, `iframe[title=${JSON.stringify(vars.interpolate(frameTitle))}]`);
  await assertions.toHaveText(locators.role.paragraph(frame), vars.interpolate(text));
});

Then('the elements with the role {string} have the texts:', async ({ uiScenario }, role: string, table: DataTable) => {
  await assertions.toHaveText(locators.byRole(uiScenario.page, role as locators.AriaRole), table.raw().map((row) => row[0] as string));
});

Then('the {string} section of the page has no accessibility violations', async ({ uiScenario }, section: string) => {
  const selector = SECTIONS[section];
  if (!selector) throw new Error(`Unknown section "${section}". Use one of: ${Object.keys(SECTIONS).join(', ')}`);
  await expectNoAccessibilityViolations(uiScenario.page, { include: selector });
});

Then('I saw the {word} dialog {string} and it was {word}', async ({ uiScenario, vars }, type: string, message: string, handled: string) => {
  if (!uiScenario.dialogs) throw new Error('No dialogs were being recorded: add "Given I accept all dialogs" (or dismiss) first');
  const recorder = uiScenario.dialogs;
  const wanted = { type, message: vars.interpolate(message), handledAs: handled };
  // a dialog is recorded just after it is answered, which can be a moment after the click that raised it returns
  await expect
    .poll(() => recorder.dialogs.some((d) => d.type === wanted.type && d.message === wanted.message && d.handledAs === wanted.handledAs), {
      message: `Expected a ${type} dialog "${wanted.message}" that was ${handled}, but saw: ${recorder.dialogs.map((d) => `${d.type} "${d.message}" (${d.handledAs})`).join(', ') || 'none'}`,
    })
    .toBe(true);
});

When('I close all other tabs', async ({ uiScenario }) => {
  await tabs.closeOtherTabs(uiScenario.page.context(), uiScenario.page);
});

Then('{int} tab(s) should be open', async ({ uiScenario }, count: number) => {
  await expect.poll(() => tabs.openPages(uiScenario.page.context()).length, { message: 'open tabs' }).toBe(count);
});

Then('the browser window is {int} by {int}', async ({ uiScenario }, width: number, height: number) => {
  await expect.poll(() => uiScenario.page.evaluate(() => `${innerWidth}x${innerHeight}`)).toBe(`${width}x${height}`);
});
