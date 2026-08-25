import * as path from 'node:path';
import { test as base, expect } from '../../src/fixtures/uiFixtures';
import { LoginPage } from './LoginPage';
import { DashboardPage } from './DashboardPage';

const fixtureUrl = `file://${path.join(__dirname, 'fixture.html')}`;

/**
 * This is the pattern every consuming project should copy for its own page
 * objects: extend the framework's `test` (imported from
 * '@automation/referenced-automation-ui' in a real project) with one
 * fixture per page object. A spec then destructures the page it needs
 * straight from the test args - `test('...', async ({ dashboardPage }) =>
 * ...)` - instead of every test hand-rolling `new SomePage(page)` and
 * repeating whatever navigation/login steps get it into the right state.
 * That repetition is exactly what regresses into copy-pasted, drifting
 * setup code across a growing spec suite if it isn't centralised here.
 */
interface PageFixtures {
  loginPage: LoginPage;
  /** Already authenticated and on the dashboard - for specs that don't care about the login step itself. */
  dashboardPage: DashboardPage;
}

export const test = base.extend<PageFixtures>({
  loginPage: async ({ page }, use) => {
    const loginPage = new LoginPage(page);
    await loginPage.open(fixtureUrl);
    await use(loginPage);
  },

  dashboardPage: async ({ page }, use) => {
    const loginPage = new LoginPage(page);
    await loginPage.open(fixtureUrl);
    const dashboardPage = await loginPage.loginAs('ada', 'secret');
    await use(dashboardPage);
  },
});

export { expect };
