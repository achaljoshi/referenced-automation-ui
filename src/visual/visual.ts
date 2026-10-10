import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { logger } from '@automation/referenced-automation-utils';

/**
 * The accessibility tree of the page or element as the YAML `toMatchAriaSnapshot` compares - to see what a template
 * should look like, or to write one: read it, trim it to what matters, paste it into the assertion.
 */
export async function ariaSnapshot(target: Page | Locator): Promise<string> {
  return 'ariaSnapshot' in target ? target.ariaSnapshot() : (target as Page).locator('body').ariaSnapshot();
}

/** Screenshot of the whole page or one element returned as a Buffer (and saved when `path` is given) - for reports and attachments, not comparison (see `assertions.toHaveScreenshot`). */
export async function capture(target: Page | Locator, options: { path?: string; fullPage?: boolean } = {}): Promise<Buffer> {
  if (options.path) fs.mkdirSync(path.dirname(path.resolve(options.path)), { recursive: true });
  const buffer = await ('goto' in target ? target.screenshot({ path: options.path, fullPage: options.fullPage }) : target.screenshot({ path: options.path }));
  if (options.path) logger.info(`Screenshot saved: ${options.path}`);
  return buffer;
}

/** Prints the page to PDF (Chromium only, headless) - to check a printable report. Uses the print stylesheet. */
export async function savePdf(page: Page, file: string, options: { format?: string; landscape?: boolean } = {}): Promise<Buffer> {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const pdf = await page.pdf({ path: file, format: options.format ?? 'A4', landscape: options.landscape });
  logger.info(`PDF saved: ${file} (${pdf.length} bytes)`);
  return pdf;
}

/** Makes the page deterministic before a screenshot: freezes animations, hides the caret and the pointer's hover. (`toHaveScreenshot` already does the first two.) */
export async function stabilizeForScreenshot(page: Page): Promise<void> {
  await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }' });
  await page.mouse.move(-1, -1);
}
