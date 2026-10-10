import type { BrowserContext, Page } from '@playwright/test';
import { step } from '../base/step';

/** Every open page (tab) of the context, oldest first. */
export function openPages(context: BrowserContext): Page[] {
  return context.pages();
}

/** A new blank tab in the same context (same cookies and storage). */
export async function openNewPage(context: BrowserContext): Promise<Page> {
  return step('Open a new tab', () => context.newPage());
}

/** Runs `action` and returns whichever new tab it opens - a link with target=_blank, `window.open`, a form post. (`actions.waitForNewTab` is the popup-of-one-page variant.) */
export async function waitForNewPage(context: BrowserContext, action: () => Promise<void>): Promise<Page> {
  return step('Wait for a new tab', async () => {
    const [page] = await Promise.all([context.waitForEvent('page'), action()]);
    await page.waitForLoadState();
    return page;
  });
}

/** The open tab whose URL contains `urlPart` or whose title matches; throws, listing the open tabs, if none does. */
export async function findTab(context: BrowserContext, match: { urlContains?: string; title?: string | RegExp }): Promise<Page> {
  for (const page of context.pages()) {
    const urlOk = match.urlContains === undefined || page.url().includes(match.urlContains);
    const title = match.title === undefined ? undefined : await page.title();
    const titleOk = match.title === undefined || (typeof match.title === 'string' ? title === match.title : match.title.test(title as string));
    if (urlOk && titleOk) return page;
  }
  const open = await Promise.all(context.pages().map(async (p) => `${p.url()} ("${await p.title()}")`));
  throw new Error(`No open tab matches ${JSON.stringify(match, (_k, v) => (v instanceof RegExp ? String(v) : v))}. Open tabs: ${open.join(', ') || '(none)'}`);
}

/** Brings the tab to the front (a visible browser; harmless headless). Playwright does not need this to act on a page. */
export async function switchToTab(page: Page): Promise<void> {
  await step(`Switch to tab ${page.url()}`, () => page.bringToFront());
}

/** Closes every tab of the context except `keep`. */
export async function closeOtherTabs(context: BrowserContext, keep: Page): Promise<void> {
  await step('Close other tabs', async () => {
    for (const page of context.pages()) if (page !== keep) await page.close();
  });
}
