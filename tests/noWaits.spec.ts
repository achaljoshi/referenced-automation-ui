import { test, expect } from '@playwright/test';
import { actions, assertions, locators } from '../src';

/**
 * The claim: code written with this framework needs no `waitForTimeout`, no
 * sleeps and no hand-written wait conditions, however late the page renders.
 *
 * This page renders every element after a delay. Notice there is not one
 * wait in any test below - only actions and web-first assertions, which wait
 * for what they need on their own. (ESLint also bans `waitForTimeout` and
 * 'networkidle' across the repo, so one can't be added by accident.)
 */
const LATE_PAGE = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Late page</title></head>
<body>
  <label for="name">Name</label>
  <input id="name" disabled />
  <button id="go" disabled>Submit</button>
  <label><input type="checkbox" id="agree" /> Agree</label>
  <p id="status" role="status"></p>
  <ul id="results"></ul>
  <script>
    setTimeout(() => { document.getElementById('name').disabled = false; }, 600);
    setTimeout(() => { document.getElementById('go').disabled = false; }, 700);
    setTimeout(() => { document.getElementById('agree').checked = true; }, 500);
    setTimeout(() => {
      const list = document.getElementById('results');
      ['alpha', 'beta', 'gamma'].forEach((t) => { const li = document.createElement('li'); li.textContent = t; list.appendChild(li); });
    }, 800);
    setTimeout(() => { document.getElementById('status').textContent = 'Saved'; }, 900);
    document.getElementById('go').addEventListener('click', () => {
      setTimeout(() => { document.getElementById('status').textContent = 'Submitted ' + document.getElementById('name').value; }, 400);
    });
  </script>
</body></html>`;

test.describe('late-rendering page, with no waits anywhere in the test code @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(LATE_PAGE);
  });

  test('actions wait for the element to be ready: fill a field that is disabled at first, click a button that is disabled at first', async ({ page }) => {
    await actions.fill(locators.byLabel(page, 'Name'), 'Ada');
    await actions.click(locators.role.button(page, 'Submit'));
    await assertions.toHaveText(locators.role.status(page), 'Submitted Ada');
  });

  test('state reads wait for the state to arrive and then answer true / the real count / the real text', async ({ page }) => {
    expect(await actions.isEnabled(locators.role.button(page, 'Submit'))).toBe(true);
    expect(await actions.isChecked(locators.role.checkbox(page, 'Agree'))).toBe(true);
    expect(await actions.count(locators.role.listitem(page))).toBe(3);
    expect(await actions.allText(locators.role.listitem(page))).toEqual(['alpha', 'beta', 'gamma']);
  });

  test('a state read that is already true answers immediately - waiting costs nothing when there is nothing to wait for', async ({ page }) => {
    await assertions.toBeVisible(locators.role.status(page)); // the element exists from the start
    const startedAt = Date.now();
    expect(await actions.isVisible(locators.role.status(page))).toBe(true);
    expect(Date.now() - startedAt).toBeLessThan(500);
  });

  test('an element that never appears answers false after the timeout you give it, not after an unbounded wait', async ({ page }) => {
    const startedAt = Date.now();
    expect(await actions.isVisible(page.getByText('this never renders'), { timeout: 300 })).toBe(false);
    const elapsed = Date.now() - startedAt;
    expect(elapsed).toBeGreaterThanOrEqual(250);
    expect(elapsed).toBeLessThan(2_000);
  });

  test('{ timeout: 0 } is the explicit opt-out: an instant snapshot that does not wait', async ({ page }) => {
    // The checkbox is only ticked at 500ms, so right now it is genuinely unchecked.
    const startedAt = Date.now();
    expect(await actions.isChecked(locators.role.checkbox(page, 'Agree'), { timeout: 0 })).toBe(false);
    expect(Date.now() - startedAt).toBeLessThan(400);
  });

  test('count and allText return 0 / [] for something that never appears, within the given timeout', async ({ page }) => {
    expect(await actions.count(page.locator('.nothing'), { timeout: 200 })).toBe(0);
    expect(await actions.allText(page.locator('.nothing'), { timeout: 200 })).toEqual([]);
  });

  // UI-01: only the timeout is "the state never arrived". Everything else is a broken test and must say so.
  test('a locator matching several elements throws (strict mode) instead of answering false / 0', async ({ page }) => {
    await page.setContent('<b>one</b><b>two</b>');
    await expect(actions.isVisible(page.locator('b'), { timeout: 300 })).rejects.toThrow(/strict mode violation/);
    await expect(actions.isEnabled(page.locator('b'), { timeout: 300 })).rejects.toThrow(/strict mode violation/);
    await expect(actions.isChecked(page.locator('b'), { timeout: 300 })).rejects.toThrow(/strict mode violation/);
  });

  test('a closed page throws instead of answering false', async ({ context }) => {
    const page = await context.newPage();
    await page.setContent('<b>one</b>');
    await page.close();
    await expect(actions.isVisible(page.locator('b'), { timeout: 300 })).rejects.toThrow();
    await expect(actions.count(page.locator('b'), { timeout: 300 })).rejects.toThrow();
    await expect(actions.allText(page.locator('b'), { timeout: 300 })).rejects.toThrow();
  });

  test('an invalid selector throws instead of answering false', async ({ page }) => {
    await page.setContent('<b>one</b>');
    await expect(actions.isVisible(page.locator('css=['), { timeout: 300 })).rejects.toThrow(/selector/i);
  });

  test('"absent" is asserted web-first: assertions.not.* waits for the thing to go, a 1 ms snapshot passes too early', async ({ page }) => {
    await page.setContent('<p id="banner">error</p><script>setTimeout(() => document.getElementById("banner").remove(), 400)</script>');
    // the snapshot is taken while the banner is still there
    expect(await actions.isVisible(page.locator('#banner'), { timeout: 0 })).toBe(true);
    await assertions.not.toBeVisible(page.locator('#banner'));
    await assertions.toBeHidden(page.locator('#banner'));
  });
});
