import type { Page } from '@playwright/test';
import { BasePage } from '../../src/base/BasePage';
import { DashboardPage } from './DashboardPage';

/**
 * Sample page object for the login screen only - proves the framework
 * works and doubles as a copy-able example for consuming teams. Not shipped
 * in the published package (see package.json "files": ["dist"]).
 *
 * One page, one page object: this used to be combined with the dashboard
 * into a single "DemoPage" god-class. Splitting them means a change to the
 * dashboard's markup can't accidentally break a login-only test, and vice
 * versa - the standard reason to keep page objects scoped to one page/view.
 */
export class LoginPage extends BasePage {
  private readonly usernameInput = this.page.locator('#username');
  private readonly passwordInput = this.page.locator('#password');
  private readonly loginButton = this.page.locator('#login-button');
  private readonly loginError = this.page.locator('#login-error');

  constructor(page: Page) {
    super(page);
  }

  async open(fixtureUrl: string): Promise<void> {
    await this.goto(fixtureUrl);
  }

  /**
   * Fluent navigation: an action that moves to a new page/view returns that
   * page's own object, so a test chains straight into it instead of
   * constructing DashboardPage itself and hoping it guessed the resulting
   * state correctly - `const dashboard = await loginPage.loginAs(...)`.
   */
  async loginAs(username: string, password: string): Promise<DashboardPage> {
    await this.fill(this.usernameInput, username);
    await this.fill(this.passwordInput, password);
    await this.click(this.loginButton);
    return new DashboardPage(this.page);
  }

  /** For the invalid-credentials case, where there's no dashboard to navigate to. */
  async attemptLogin(username: string, password: string): Promise<void> {
    await this.fill(this.usernameInput, username);
    await this.fill(this.passwordInput, password);
    await this.click(this.loginButton);
  }

  async isErrorShown(): Promise<boolean> {
    return this.isVisible(this.loginError);
  }
}
