import { test, expect } from '../src/fixtures/uiFixtures';
import * as actions from '../src/actions';
import * as assertions from '../src/assertions';
import * as tabs from '../src/tabs/tabs';
import * as evaluate from '../src/evaluate/evaluate';
import { APP, serveContext, servePage } from './support/servePage';

test.describe('tabs', () => {
  test.beforeEach(async ({ context, page }) => {
    await serveContext(context, {
      '/': '<title>Home</title><a id="l" target="_blank" href="/second">go</a>',
      '/second': '<title>Second page</title><h1>Second</h1>',
      '/third': '<title>Third</title>',
    });
    await page.goto(`${APP}/`);
  });

  test('waitForNewPage returns the tab the click opened; openPages lists them', async ({ context, page }) => {
    const second = await tabs.waitForNewPage(context, () => actions.click(page.locator('#l')));
    await assertions.toHaveTitle(second, 'Second page');
    expect(tabs.openPages(context)).toHaveLength(2);
  });

  test('openNewPage, findTab by URL or title, switchToTab', async ({ context, page }) => {
    const third = await tabs.openNewPage(context);
    await third.goto(`${APP}/third`);
    expect(await tabs.findTab(context, { urlContains: '/third' })).toBe(third);
    expect(await tabs.findTab(context, { title: 'Home' })).toBe(page);
    expect(await tabs.findTab(context, { title: /^Thi/, urlContains: 'third' })).toBe(third);
    await tabs.switchToTab(third);
    await expect(tabs.findTab(context, { urlContains: '/nowhere' })).rejects.toThrow(/No open tab matches .*nowhere.*Open tabs: .*Home/);
  });

  test('closeOtherTabs keeps one', async ({ context, page }) => {
    await tabs.waitForNewPage(context, () => actions.click(page.locator('#l')));
    await tabs.closeOtherTabs(context, page);
    expect(tabs.openPages(context)).toEqual([page]);
  });
});

test.describe('evaluate and browser-API mocks', () => {
  test('evaluate passes values in and returns results; waitForPageFunction returns the moment the condition holds', async ({ page }) => {
    await servePage(page, '<script>setTimeout(() => (window.ready = { n: 5 }), 200)</script>');
    expect(await evaluate.evaluate(page, (n: number) => n * 2, 21)).toBe(42);
    await evaluate.waitForPageFunction(page, (min: number) => ((window as unknown as { ready?: { n: number } }).ready?.n ?? 0) >= min, 3);
    expect(await evaluate.evaluate(page, () => (window as unknown as { ready: { n: number } }).ready.n)).toBe(5);
  });

  test('addInitScript runs before the page scripts; exposeFunction lets the page call back into the test', async ({ page }) => {
    const calls: unknown[] = [];
    await evaluate.exposeFunction(page, 'report', (value: unknown) => void calls.push(value));
    await evaluate.addInitScript(page, (seed: string) => ((window as unknown as { seed: string }).seed = seed), 'planted');
    await servePage(page, '<script>report(window.seed)</script>');
    expect(calls).toEqual(['planted']);
  });

  test('mockNavigatorProperty replaces a navigator value before the page reads it', async ({ page }) => {
    await evaluate.mockNavigatorProperty(page, 'onLine', false);
    await servePage(page, '<p id="s"></p><script>s.textContent = navigator.onLine ? "online" : "offline"</script>');
    await assertions.toHaveText(page.locator('#s'), 'offline');
  });

  test('stubWindowOpen records what the page tried to open and opens nothing', async ({ page, context }) => {
    await evaluate.stubWindowOpen(page);
    await servePage(page, '<button onclick="window.open(\'https://example.test/x\', \'_blank\')">open</button>');
    await actions.click(page.getByRole('button', { name: 'open' }));
    expect(await evaluate.openedWindows(page)).toEqual([['https://example.test/x', '_blank']]);
    expect(context.pages()).toHaveLength(1);
  });

  test('mockClipboard: the page copies, the test reads it back - no permissions needed', async ({ page }) => {
    await evaluate.mockClipboard(page, 'initial');
    await servePage(page, '<button onclick="navigator.clipboard.writeText(\'copied!\')">copy</button>');
    expect(await evaluate.readMockClipboard(page)).toBe('initial');
    await actions.click(page.getByRole('button', { name: 'copy' }));
    await expect.poll(() => evaluate.readMockClipboard(page)).toBe('copied!');
  });
});
