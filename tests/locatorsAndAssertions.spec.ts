import * as path from 'node:path';
import { test, expect } from '@playwright/test';
import { role, byRole, byText, byLabel, byPlaceholder, byTestId } from '../src/locators';
import * as assertions from '../src/assertions';

const fixtureUrl = `file://${path.join(__dirname, 'support', 'fixture.html')}`;

async function login(page: import('@playwright/test').Page): Promise<void> {
  await role.textbox(page, 'Username').fill('ada');
  await byLabel(page, 'Password').fill('secret');
  await role.button(page, 'Log in').click();
}

test.describe('role-based locators (locators.role.*) @smoke', () => {
  test('role shorthands locate real elements by ARIA role and accessible name', async ({ page }) => {
    await page.goto(fixtureUrl);

    await assertions.toBeVisible(role.heading(page, 'Login', { level: 1 }));
    await assertions.toBeVisible(role.button(page, 'Log in'));
    await assertions.toBeVisible(role.button(page, /log in/i));
    await assertions.toBeVisible(role.button(page, 'Log in', { exact: true }));
    await assertions.toHaveCount(role.button(page, 'nonexistent button', { exact: true }), 0);
  });

  test('role.textbox/checkbox/combobox/link locate real interactive elements after login', async ({ page }) => {
    await page.goto(fixtureUrl);
    await login(page);

    await assertions.toBeVisible(role.heading(page, 'Dashboard'));
    await assertions.toBeHidden(role.heading(page, 'Login'));

    const subscribe = role.checkbox(page, 'Subscribe');
    await assertions.toBeVisible(subscribe);
    await assertions.not.toBeChecked(subscribe);
    await subscribe.check();
    await assertions.toBeChecked(subscribe);

    const country = role.combobox(page, 'Country');
    await country.selectOption('uk');
    await assertions.toHaveValue(country, 'uk');

    await assertions.toBeVisible(role.link(page, 'Download report'));
    await assertions.toBeVisible(role.link(page, 'Open new tab'));
  });

  test('role.listitem locates dynamically-added items and toHaveCount/toHaveText confirm them', async ({ page }) => {
    await page.goto(fixtureUrl);
    await login(page);

    await role.button(page, 'Load items').click();
    const items = role.listitem(page);
    await assertions.toHaveCount(items, 3);
    await assertions.toHaveText(items, ['Item 1', 'Item 2', 'Item 3']);
  });
});

test.describe('other getBy* locators (locators.byText/byLabel/byPlaceholder/byTestId/byRole) @smoke', () => {
  test('each locator finds the same real elements the role shorthands do', async ({ page }) => {
    await page.goto(fixtureUrl);

    await assertions.toBeVisible(byText(page, 'Login'));
    await assertions.toBeVisible(byPlaceholder(page, 'Username'));
    await assertions.toBeVisible(byLabel(page, 'Password'));
    await assertions.toBeVisible(byTestId(page, 'login-button'));
    await assertions.toBeVisible(byRole(page, 'button', { name: 'Log in' }));
  });
});

test.describe('assertions.* covers attributes, classes, ids, and page-level checks @smoke', () => {
  test('locator-level assertions against real DOM state', async ({ page }) => {
    await page.goto(fixtureUrl);
    const loginButton = role.button(page, 'Log in');

    await assertions.toHaveId(loginButton, 'login-button');
    await assertions.toHaveAttribute(loginButton, 'data-testid', 'login-button');
    await assertions.toHaveAttribute(loginButton, 'id'); // presence-only overload
    await assertions.toHaveRole(loginButton, 'button');
    await assertions.toHaveAccessibleName(loginButton, 'Log in');
  });

  test('page-level assertions against the real page', async ({ page }) => {
    await page.goto(fixtureUrl);

    await assertions.toHaveTitle(page, 'Framework Demo Fixture');
    await assertions.toHaveURL(page, /fixture\.html$/);
    await assertions.not.toHaveTitle(page, 'Some Other Title');
  });

  test('a genuine failure is reported with a readable Playwright assertion error', async ({ page }) => {
    await page.goto(fixtureUrl);
    await expect(assertions.toBeVisible(role.heading(page, 'A heading that does not exist'), { timeout: 500 })).rejects.toThrow(
      /toBeVisible/,
    );
  });
});
