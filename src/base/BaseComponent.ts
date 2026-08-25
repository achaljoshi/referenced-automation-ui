import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Base class for a reusable UI *component* - a widget (a modal, a data
 * table, a nav bar, a file-upload control, ...) that appears identically on
 * several different pages and shouldn't have its interactions copy-pasted
 * into every page object that happens to embed it.
 *
 * Where BasePage models a whole page, BaseComponent models a fragment of
 * one, scoped to a root Locator. It extends BasePage (so it gets the same
 * logged click/fill/getText/etc. helpers "for free") and adds `within()` for
 * looking up elements relative to that root instead of the whole page:
 *
 * ```ts
 * class ConfirmDialog extends BaseComponent {
 *   private readonly confirmButton = this.within('button.confirm');
 *
 *   constructor(page: Page, root: Locator) {
 *     super(page, root);
 *   }
 *
 *   async confirm(): Promise<void> {
 *     await this.click(this.confirmButton);
 *   }
 * }
 *
 * // in a page object that can show this dialog:
 * async deleteItem(): Promise<ConfirmDialog> {
 *   await this.click(this.deleteButton);
 *   return new ConfirmDialog(this.page, this.page.locator('.dialog'));
 * }
 * ```
 *
 * Any page object that embeds the same widget (e.g. every page with a
 * shared nav bar) constructs the same Component class rather than
 * reimplementing its interactions - that's the reuse this buys over just
 * having every page object extend BasePage alone.
 */
export abstract class BaseComponent extends BasePage {
  protected readonly root: Locator;

  protected constructor(page: Page, root: Locator) {
    super(page);
    this.root = root;
  }

  /** Looks up an element inside this component's root, not the whole page. */
  within(selector: string): Locator {
    return this.root.locator(selector);
  }

  async isVisibleRoot(): Promise<boolean> {
    return this.isVisible(this.root);
  }
}
