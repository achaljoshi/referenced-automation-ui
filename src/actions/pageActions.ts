import type { Download, FrameLocator, Page, Response } from '@playwright/test';
import { logger } from '@automation/referenced-automation-utils';
import { step } from '../base/step';

/**
 * Page-level actions (navigation, tabs, downloads, network mocking) - every
 * one takes the Page to act on explicitly, the same reasoning as
 * elementActions.ts: composition over a base class, so a page object built
 * as a plain factory function reuses these instead of reimplementing them.
 */

export async function goto(page: Page, url: string): Promise<void> {
  await step(`Navigate to ${url}`, () => page.goto(url));
}

export async function reload(page: Page): Promise<void> {
  await step('Reload page', () => page.reload());
}

export async function goBack(page: Page): Promise<void> {
  await step('Go back', () => page.goBack());
}

export async function goForward(page: Page): Promise<void> {
  await step('Go forward', () => page.goForward());
}

export function currentUrl(page: Page): string {
  return page.url();
}

export async function title(page: Page): Promise<string> {
  return page.title();
}

export async function waitForUrlContains(page: Page, fragment: string, timeoutMs?: number): Promise<void> {
  await page.waitForURL((url) => url.toString().includes(fragment), { timeout: timeoutMs });
}

export async function waitForLoadState(
  page: Page,
  state: 'load' | 'domcontentloaded' | 'networkidle' = 'load',
): Promise<void> {
  await page.waitForLoadState(state);
}

/** Waits for a response whose URL matches, without triggering a new navigation - use around the action that fires it. */
export async function waitForResponseMatching(
  page: Page,
  urlPattern: string | RegExp,
  action: () => Promise<void>,
): Promise<Response> {
  const [response] = await Promise.all([page.waitForResponse(urlPattern), action()]);
  return response;
}

export async function screenshotPage(page: Page, name: string): Promise<Buffer> {
  logger.info(`Screenshot (full page): ${name}`);
  return page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
}

export function frame(page: Page, selector: string): FrameLocator {
  return page.frameLocator(selector);
}

/** Runs `action` (e.g. clicking an "open in new tab" link) and returns the tab it opens. */
export async function waitForNewTab(page: Page, action: () => Promise<void>): Promise<Page> {
  const [popup] = await Promise.all([page.waitForEvent('popup'), action()]);
  await popup.waitForLoadState();
  return popup;
}

/** Runs `action` (e.g. clicking a download link) and saves the resulting file to `savePath`. */
export async function downloadFile(
  page: Page,
  action: () => Promise<void>,
  savePath: string,
): Promise<Download> {
  const [download] = await Promise.all([page.waitForEvent('download'), action()]);
  await download.saveAs(savePath);
  return download;
}

/** Fulfils every request matching `urlPattern` with `response` instead of hitting the network. */
export async function mockRoute(
  page: Page,
  urlPattern: string | RegExp,
  response: { status?: number; contentType?: string; body: string },
): Promise<void> {
  await page.route(urlPattern, (route) =>
    route.fulfill({
      status: response.status ?? 200,
      contentType: response.contentType ?? 'application/json',
      body: response.body,
    }),
  );
}

/** Aborts every request matching `urlPattern` - useful for simulating a failed dependency. */
export async function blockRoute(page: Page, urlPattern: string | RegExp): Promise<void> {
  await page.route(urlPattern, (route) => route.abort());
}

export async function unrouteAll(page: Page): Promise<void> {
  await page.unrouteAll();
}
