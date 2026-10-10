import type { Frame, FrameLocator, Locator, Page } from '@playwright/test';
import type { Scope } from './types';

/** CSS selector. Prefer a role / label / test id; use this when the page offers nothing user-facing to hold on to. */
export function byCss(scope: Scope, selector: string): Locator {
  return scope.locator(`css=${selector}`);
}

/** XPath. A last resort: it breaks when the markup is restructured, and it cannot see into shadow roots. */
export function byXpath(scope: Scope, xpath: string): Locator {
  return scope.locator(`xpath=${xpath}`);
}

export interface FilterOptions {
  /** Keep elements whose text contains this (case-insensitive substring) or matches this pattern. */
  hasText?: string | RegExp;
  /** Drop elements whose text contains / matches this. */
  hasNotText?: string | RegExp;
  /** Keep elements that contain a descendant matching this locator. */
  has?: Locator;
  /** Drop elements that contain a descendant matching this locator. */
  hasNot?: Locator;
  /** `true` keeps only visible elements, `false` only hidden ones. */
  visible?: boolean;
}

/** Narrows a locator without a new selector: `filterBy(role.listitem(page), { hasText: 'Product 2' })`. */
export function filterBy(locator: Locator, options: FilterOptions): Locator {
  return locator.filter(options);
}

/** Either locator - whichever is on the page (a cookie banner OR a login form, a toast OR a dialog). Add `.first()` when both can be there at once. */
export function either(first: Locator, second: Locator): Locator {
  return first.or(second);
}

/** Elements matching BOTH locators: `both(role.button(page), byTitle(page, 'Subscribe'))`. */
export function both(first: Locator, second: Locator): Locator {
  return first.and(second);
}

/** `inner` searched once inside every match of `container` (the third cell of every row, not the third cell of the table). */
export function within(inner: Locator, container: Locator): Locator {
  return inner.within(container);
}

/** The nth match, 0-based. Prefer `filterBy` - an index changes meaning when the page changes. */
export function nth(locator: Locator, index: number): Locator {
  return locator.nth(index);
}

/** Every match as its own locator, for looping: `for (const row of await all(rows)) ...`. */
export async function all(locator: Locator): Promise<Locator[]> {
  return locator.all();
}

/**
 * Nested iframes by selector, outermost first: `frameChain(page, ['#outer', '#inner'])` is
 * `page.frameLocator('#outer').frameLocator('#inner')`. The result is a scope - pass it to `role.button(scope, ...)` etc.
 */
export function frameChain(page: Page | FrameLocator, selectors: string[]): FrameLocator {
  if (selectors.length === 0) throw new Error('frameChain needs at least one selector');
  return selectors.reduce<Page | FrameLocator>((scope, selector) => scope.frameLocator(selector), page) as FrameLocator;
}

/** The Frame object for a frame by name or URL, when you need frame-level API (`frame.url()`, `frame.evaluate`). Throws if there is none. */
export function frameBy(page: Page, match: string | { name?: string; url?: string | RegExp }): Frame {
  const frame = page.frame(match);
  if (!frame) throw new Error(`No frame matches ${JSON.stringify(match, (_k, v) => (v instanceof RegExp ? String(v) : v))}. Frames on the page: ${page.frames().map((f) => f.name() || f.url()).join(', ')}`);
  return frame;
}

// ---- tables ----

/** The row of `table` whose text contains `text` (or matches a pattern): `rowWithText(table, 'Ada')`. */
export function rowWithText(table: Locator, text: string | RegExp): Locator {
  return table.getByRole('row').filter({ hasText: text });
}

/** One cell of a row, by its column header: `cellInRow(table, row, 'Email')`. Works for tables with a header row of `columnheader`s. */
export async function cellInRow(table: Locator, row: Locator, columnName: string | RegExp): Promise<Locator> {
  const headers = await table.getByRole('columnheader').allInnerTexts();
  const index = headers.findIndex((header) => (typeof columnName === 'string' ? header.trim().toLowerCase() === columnName.toLowerCase() : columnName.test(header.trim())));
  if (index === -1) throw new Error(`No column "${String(columnName)}" in the table. Columns: ${headers.map((h) => h.trim()).join(', ')}`);
  return row.getByRole('cell').nth(index);
}

/**
 * A table as an array of objects keyed by the header texts - what a test wants to assert on:
 * `expect(await readTable(table)).toEqual([{ Name: 'Ada', Role: 'Admin' }])`. Waits for at least one body row first.
 */
export async function readTable(table: Locator): Promise<Array<Record<string, string>>> {
  await table.getByRole('row').nth(1).waitFor({ state: 'attached' }).catch(() => undefined);
  const headers = (await table.getByRole('columnheader').allInnerTexts()).map((h) => h.trim());
  const rows = await table.getByRole('row').filter({ has: table.page().locator('td, [role=cell]') }).all();
  const result: Array<Record<string, string>> = [];
  for (const row of rows) {
    const cells = (await row.getByRole('cell').allInnerTexts()).map((c) => c.trim());
    result.push(Object.fromEntries(headers.map((header, index) => [header || `column${index + 1}`, cells[index] ?? ''])));
  }
  return result;
}
