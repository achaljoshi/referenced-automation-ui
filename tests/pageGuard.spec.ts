import { test, expect } from '../src/fixtures/uiFixtures';
import { guardPage } from '../src/diagnostics/pageGuard';
import { APP, servePage } from './support/servePage';
import { runPlaywright } from './support/runPlaywright';

const BROKEN = `
<script>
  console.error('boom: widget failed to load');
  console.warn('deprecated call');
  setTimeout(() => { throw new Error('uncaught in timer'); }, 0);
  fetch('/missing');
  fetch('/down');
</script>`;

test.describe('guardPage', () => {
  test('collects console errors, uncaught exceptions, failed requests and 4xx/5xx', async ({ page }) => {
    await page.route(`${APP}/missing`, (route) => route.fulfill({ status: 404, body: 'no' }));
    await page.route(`${APP}/down`, (route) => route.abort('connectionrefused'));
    const guard = guardPage(page);
    await servePage(page, BROKEN);
    await expect.poll(() => guard.problems.length).toBeGreaterThanOrEqual(5);
    const kinds = guard.problems.map((p) => p.kind).sort();
    // two page errors: the timer's exception, and the unhandled rejection of the fetch that was refused
    expect(kinds).toEqual(['console-error', 'http-error', 'page-error', 'page-error', 'request-failed']);
    expect(guard.problems.find((p) => p.kind === 'console-error')?.text).toBe('boom: widget failed to load');
    expect(() => guard.expectClean()).toThrow(/5 problem\(s\) on the page:[\s\S]*\[console-error\] boom[\s\S]*\[page-error\] uncaught in timer/);
    guard.stop();
  });

  test('warnings count only when asked; known noise can be ignored by text or URL; 404 favicons never count', async ({ page }) => {
    await page.route(`${APP}/favicon.ico`, (route) => route.fulfill({ status: 404, body: '' }));
    const strict = guardPage(page, { warnings: true, httpErrors: false, failedRequests: false, ignore: [/uncaught in timer/, 'boom'] });
    await servePage(page, `${BROKEN}<link rel="icon" href="/favicon.ico">`);
    await expect.poll(() => strict.problems.length).toBeGreaterThanOrEqual(1);
    expect(strict.problems.map((p) => p.kind)).toEqual(['console-warning']);
    strict.stop();
  });

  test('a clean page passes expectClean; stop() stops listening', async ({ page }) => {
    const guard = guardPage(page);
    await servePage(page, '<p>fine</p>');
    guard.expectClean();
    guard.stop();
    await page.evaluate(() => console.error('after stop'));
    expect(guard.problems).toHaveLength(0);
  });
});

test.describe('pageGuard fixture and guardedTest (run as nested tests, because the point is how a failing test reports)', () => {
  const SPEC = `
    const { test, guardedTest, expect } = require(__FRAMEWORK__);
    const html = '<script>console.error("page said no")</script>';
    const open = (page) => page.route('https://app.test/', r => r.fulfill({ contentType: 'text/html', body: html })).then(() => page.goto('https://app.test/'));

    test('requested guard, problems only attached', async ({ page, pageGuard }) => { await open(page); await expect.poll(() => pageGuard.problems.length).toBe(1); });

    test.describe('strict', () => {
      test.use({ failOnPageProblems: true });
      test('requested guard, problems fatal', async ({ page, pageGuard }) => { await open(page); await expect.poll(() => pageGuard.problems.length).toBe(1); });
      test('ignored noise is not fatal', async ({ page, pageGuard }) => { test.use; await open(page); await expect.poll(() => pageGuard.problems.length).toBeGreaterThanOrEqual(0); });
    });
    test.describe('ignoring', () => {
      test.use({ failOnPageProblems: true, pageProblemsIgnore: [/page said no/] });
      test('known noise ignored', async ({ page, pageGuard }) => { await open(page); await page.waitForLoadState(); expect(pageGuard.problems).toHaveLength(0); });
    });

    guardedTest.describe('guarded', () => {
      guardedTest.use({ failOnPageProblems: true });
      guardedTest('guard is on without being requested', async ({ page }) => { await open(page); await page.waitForLoadState(); });
      guardedTest('...and a page with no problems passes', async ({ page }) => { await page.goto('about:blank'); });
    });
  `;

  test('failOnPageProblems fails a passing test; without it problems are attached; ignore list silences noise; guardedTest guards without asking', () => {
    const results = Object.fromEntries(runPlaywright({ 'guard.spec.js': SPEC }).map((r) => [r.title, r]));
    expect(results['requested guard, problems only attached']).toMatchObject({ status: 'passed' });
    expect(results['requested guard, problems only attached']?.attachments).toContain('page-problems.txt');
    expect(results['requested guard, problems fatal']?.status).toBe('failed');
    expect(results['requested guard, problems fatal']?.errors.join('\n')).toMatch(/1 problem\(s\) on the page:\n\[console-error\] page said no/);
    expect(results['known noise ignored']?.status).toBe('passed');
    expect(results['guard is on without being requested']?.status).toBe('failed');
    expect(results['guard is on without being requested']?.errors.join('\n')).toMatch(/page said no/);
    expect(results['...and a page with no problems passes']?.status).toBe('passed');
  });
});
