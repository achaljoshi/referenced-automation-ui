import { test, expect } from './support/fixtures';
import { checkAccessibility, formatViolations } from '../src/accessibility/axeHelper';
import { LoginPage } from './support/LoginPage';

test.describe('accessibility (axe-core) @regression', () => {
  test('the login form has no WCAG 2.1 AA violations', async ({ loginPage, page }) => {
    void loginPage; // fixture's navigation is the setup this test needs; the page object itself isn't used further
    const results = await checkAccessibility(page);
    expect(results.violations, formatViolations(results.violations)).toEqual([]);
  });

  test('scan can be scoped to part of the page via include/exclude', async ({ dashboardPage, page }) => {
    void dashboardPage;
    const results = await checkAccessibility(page, { include: '#dashboard-section' });
    expect(results.violations, formatViolations(results.violations)).toEqual([]);
  });

  test('BasePage.expectNoAccessibilityViolations throws with a readable message on a real violation', async ({
    page,
  }) => {
    // A deliberately inaccessible fragment (image with no alt text) to prove
    // the assertion actually catches something, not just that it passes on
    // an already-clean page. Any BasePage subclass exposes the assertion -
    // LoginPage is used here purely as *a* BasePage, not for its login
    // behaviour.
    await page.setContent('<img src="data:," />');
    const anyPage = new LoginPage(page);

    await expect(anyPage.expectNoAccessibilityViolations()).rejects.toThrow(/image-alt/);
  });
});
