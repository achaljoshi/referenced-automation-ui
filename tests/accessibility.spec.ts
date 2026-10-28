import { test, expect } from '@playwright/test';
import { expectNoAccessibilityViolations } from '../src/accessibility/axeHelper';

// "The login form / the dashboard has no WCAG 2.1 AA violations" are scenarios now (features/login.feature,
// features/dashboard.feature). This is the negative control, which cannot be a scenario: its subject is a step that FAILS.
test.describe('accessibility (axe-core) @regression @a11y', () => {
  test('expectNoAccessibilityViolations throws with a readable message on a real violation', async ({ page }) => {
    // A deliberately inaccessible fragment (image with no alt text) to prove
    // the assertion actually catches something, not just that it passes on
    // an already-clean page. checkAccessibility/expectNoAccessibilityViolations
    // are plain functions taking `page` directly - no page object needed to
    // use them.
    await page.setContent('<img src="data:," />');

    await expect(expectNoAccessibilityViolations(page)).rejects.toThrow(/image-alt/);
  });
});
