import * as path from 'node:path';
import { test, expect } from '../src/fixtures/uiFixtures';
import { checkAccessibility, formatViolations } from '../src/accessibility/axeHelper';
import { DemoPage } from './support/DemoPage';

const fixtureUrl = `file://${path.join(__dirname, 'support', 'fixture.html')}`;

test.describe('accessibility (axe-core) @regression', () => {
  test('the login form has no WCAG 2.1 AA violations', async ({ page }) => {
    const demo = new DemoPage(page);
    await demo.openFixture(fixtureUrl);

    const results = await checkAccessibility(page);
    expect(results.violations, formatViolations(results.violations)).toEqual([]);
  });

  test('scan can be scoped to part of the page via include/exclude', async ({ page }) => {
    const demo = new DemoPage(page);
    await demo.openFixture(fixtureUrl);
    await demo.loginAs('ada', 'secret');

    const results = await checkAccessibility(page, { include: '#dashboard-section' });
    expect(results.violations, formatViolations(results.violations)).toEqual([]);
  });

  test('BasePage.expectNoAccessibilityViolations throws with a readable message on a real violation', async ({
    page,
  }) => {
    // A deliberately inaccessible fragment (image with no alt text) to prove
    // the assertion actually catches something, not just that it passes on
    // an already-clean page.
    await page.setContent('<img src="data:," />');
    const demo = new DemoPage(page);

    await expect(demo.expectNoAccessibilityViolations()).rejects.toThrow(/image-alt/);
  });
});
