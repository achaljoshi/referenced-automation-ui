import type { BrowserContext, Page } from '@playwright/test';

export const APP = 'https://app.test';

/**
 * Serves `html` at https://app.test/ (answered by a route - no server, no network) and opens it. Relative URLs in the
 * page (fetch('/api/x')) resolve against that origin, so an endpoint is just another route.
 */
export async function servePage(page: Page, html: string, path = '/'): Promise<void> {
  await page.route(`${APP}${path}`, (route) => route.fulfill({ contentType: 'text/html', body: html }), { times: 1 });
  await page.goto(`${APP}${path}`);
}

/** The same, but for every page of a context (new tabs included). */
export async function serveContext(context: BrowserContext, pages: Record<string, string>): Promise<void> {
  await context.route(`${APP}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    const html = pages[path];
    return html === undefined ? route.fulfill({ status: 404, body: 'not found' }) : route.fulfill({ contentType: 'text/html', body: html });
  });
}
