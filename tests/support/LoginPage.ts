import type { Page } from '@playwright/test';
import { actions, locators } from '../../src';
import { createDashboardPage, type DashboardPage } from './DashboardPage';

/**
 * Sample page object for the login screen only - proves the framework
 * works and doubles as a copy-able example for consuming teams. Not shipped
 * in the published package (see package.json "files": ["dist"]).
 *
 * A plain factory function, not a class: locators and page-specific
 * behaviour are composed from the framework's `actions` functions via
 * closures, rather than inherited from a base class. One page, one factory.
 *
 * Locators prefer `locators.role.*`/`locators.byLabel`/`locators.byText`
 * over raw CSS ids wherever the element has real ARIA semantics - the same
 * thing Playwright's own getByRole()/getByLabel() give you, just with
 * per-role autocomplete. A raw `page.locator(...)` is only for elements
 * with no meaningful accessible name/role of their own.
 */
export interface LoginPage {
  open(fixtureUrl: string): Promise<void>;
  /**
   * Fluent navigation: an action that moves to a new page/view returns that
   * page's own object, so a test chains straight into it instead of
   * building DashboardPage itself and hoping it guessed the resulting
   * state correctly - `const dashboard = await loginPage.loginAs(...)`.
   */
  loginAs(username: string, password: string): Promise<DashboardPage>;
  /** For the invalid-credentials case, where there's no dashboard to navigate to. */
  attemptLogin(username: string, password: string): Promise<void>;
  isErrorShown(): Promise<boolean>;
}

export function createLoginPage(page: Page): LoginPage {
  const usernameInput = locators.role.textbox(page, 'Username');
  // Not locators.role.textbox: input[type=password] has no corresponding
  // ARIA role (browsers deliberately don't expose it as a plain textbox),
  // so byLabel - which matches via the <label> association, not a role -
  // is the reliable way to find it.
  const passwordInput = locators.byLabel(page, 'Password');
  const loginButton = locators.role.button(page, 'Log in');
  const loginError = locators.byText(page, 'Invalid credentials');

  async function attemptLogin(username: string, password: string): Promise<void> {
    await actions.fill(usernameInput, username);
    await actions.fill(passwordInput, password);
    await actions.click(loginButton);
  }

  return {
    async open(fixtureUrl) {
      await actions.goto(page, fixtureUrl);
    },

    async loginAs(username, password) {
      await attemptLogin(username, password);
      return createDashboardPage(page);
    },

    attemptLogin,

    async isErrorShown() {
      return actions.isVisible(loginError);
    },
  };
}
