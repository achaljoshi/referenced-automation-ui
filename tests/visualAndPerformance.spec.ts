import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test, expect } from '../src/fixtures/uiFixtures';
import * as assertions from '../src/assertions';
import * as visual from '../src/visual/visual';
import * as performance from '../src/performance/performance';
import { startAppServer, type AppServer } from './support/appServer';
import { servePage } from './support/servePage';

// Solid colours only: no text, so the baselines are identical on macOS, Windows and Linux. (Text-heavy pages need
// baselines made on the machine - or container - that CI uses; see docs/PLAYWRIGHT_COVERAGE.md.)
const SWATCHES = `
<style>body{margin:0;background:#fff} .s{width:120px;height:80px;display:inline-block;margin:10px} #clock{display:block;width:150px;height:30px;background:#09c;color:#09c}</style>
<div id="red" class="s" style="background:#c33"></div><div id="green" class="s" style="background:#3a3"></div>
<span id="clock">00:00</span>
<ul><li>First</li><li>Second</li></ul><h1>Orders</h1><button>Save</button>
`;

test.describe('visual comparison', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 300 });
    await servePage(page, SWATCHES);
  });

  test('an element matches its baseline', async ({ page }) => {
    await assertions.toHaveScreenshot(page.locator('#red'), 'red-swatch.png');
  });

  test('the page matches its baseline; a masked element may change between runs', async ({ page }) => {
    await page.locator('#clock').evaluate((el) => (el.textContent = new Date().toISOString()));
    await assertions.toHaveScreenshot(page, 'swatches-page.png', { mask: [page.locator('#clock')], maxDiffPixelRatio: 0.01 });
  });

  test('a changed page does NOT match: the failure is a failure', async ({ page }) => {
    await page.locator('#red').evaluate((el) => ((el as HTMLElement).style.background = '#33c'));
    await expect(assertions.toHaveScreenshot(page.locator('#red'), 'red-swatch.png', { timeout: 2000 })).rejects.toThrow(/Screenshot comparison failed|pixels .* are different/s);
  });

  test('toMatchAriaSnapshot checks structure and ignores what the template leaves out', async ({ page }) => {
    // Order matters (it is the page's order); a template may leave things out - here the second list item and the
    // list's own name - but not put them in a different order.
    await assertions.toMatchAriaSnapshot(page.locator('body'), `
      - list:
        - listitem: First
      - heading "Orders" [level=1]
      - button /Sav/
    `);
    await expect(
      assertions.toMatchAriaSnapshot(page.locator('body'), '- heading "Invoices"', { timeout: 1000 }),
    ).rejects.toThrow(/Expected|Received/);
  });

  test('ariaSnapshot reads the tree back as the YAML a template is written from', async ({ page }) => {
    const yaml = await visual.ariaSnapshot(page.locator('body'));
    expect(yaml).toContain('heading "Orders" [level=1]');
    expect(yaml).toContain('button "Save"');
    expect(await visual.ariaSnapshot(page)).toContain('heading "Orders"');
  });

  test('capture saves a screenshot of a page or an element; savePdf prints (Chromium)', async ({ page, browserName }) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-'));
    const page1 = await visual.capture(page, { path: path.join(dir, 'page.png'), fullPage: true });
    const element = await visual.capture(page.locator('#red'), { path: path.join(dir, 'sub', 'red.png') });
    expect(page1.subarray(1, 4).toString()).toBe('PNG');
    expect(element.length).toBeGreaterThan(50);
    expect(fs.existsSync(path.join(dir, 'sub', 'red.png'))).toBe(true);
    if (browserName === 'chromium') {
      const pdf = await visual.savePdf(page, path.join(dir, 'page.pdf'));
      expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    }
  });

  test('stabilizeForScreenshot freezes animations', async ({ page }) => {
    await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<div id="a" style="transition:width 10s;width:10px"></div>'));
    await visual.stabilizeForScreenshot(page);
    await page.locator('#a').evaluate((el) => ((el as HTMLElement).style.width = '200px'));
    expect(await page.locator('#a').evaluate((el) => el.getBoundingClientRect().width)).toBe(200);
  });
});

test.describe('performance', () => {
  let app: AppServer;
  test.beforeAll(async () => {
    app = await startAppServer();
  });
  test.afterAll(async () => {
    await app.stop();
  });

  test('navigationTiming and webVitals read the browser\'s own measurements', async ({ page, browserName }) => {
    await page.goto(app.url);
    const timing = await performance.navigationTiming(page);
    expect(timing.ttfb).toBeGreaterThanOrEqual(0);
    expect(timing.load).toBeGreaterThanOrEqual(timing.domContentLoaded);
    expect(timing.url).toBe(`${app.url}/`);
    expect(timing.transferSize).toBeGreaterThan(0);
    const vitals = await performance.webVitals(page);
    expect(vitals.cls).toBeGreaterThanOrEqual(0);
    // The headless Chromium shell Playwright uses by default reports no paint metrics (they are undefined); a headed or channel browser does.
    if (vitals.fcp !== undefined) expect(vitals.fcp).toBeGreaterThan(0);
    void browserName;
  });

  test('expectWithinBudget passes inside the budget and names every metric that is over', async ({ page }) => {
    await page.goto(app.url);
    const ok = await performance.expectWithinBudget(page, { loadMs: 30_000, cls: 1, ttfbMs: 30_000 });
    expect(ok.timing.load).toBeGreaterThan(0);
    await expect(performance.expectWithinBudget(page, { loadMs: 0, domContentLoadedMs: 0, transferBytes: 1 })).rejects.toThrow(/Over the performance budget: DOMContentLoaded .*; load .*; transfer size/);
  });
});
