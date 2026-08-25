import type { Download, FrameLocator, Locator, Page, Response } from '@playwright/test';
import { logger } from '@automation/referenced-automation-utils';
import { step as loggedStep } from './step';

/**
 * Base class for every Page Object in this framework and in any consuming
 * project. Extend it, call `super(page)`, and use these helpers instead of
 * talking to raw Playwright APIs directly - every action is logged (console
 * + logs/automation.log, visible locally and in CI) the same way regardless
 * of which page object calls it.
 *
 * Playwright's own Locator API already auto-waits and auto-retries, so this
 * is deliberately a thin wrapper, not a reimplementation - the value it adds
 * is consistent logging and a couple of higher-level flows (frames, new
 * tabs, downloads, network mocking) that are otherwise verbose to write out
 * by hand in every test.
 */
export abstract class BasePage {
  protected constructor(protected readonly page: Page) {}

  // ---- navigation ----

  async goto(url: string): Promise<void> {
    await loggedStep(`Navigate to ${url}`, () => this.page.goto(url));
  }

  async reload(): Promise<void> {
    await loggedStep('Reload page', () => this.page.reload());
  }

  async goBack(): Promise<void> {
    await loggedStep('Go back', () => this.page.goBack());
  }

  async goForward(): Promise<void> {
    await loggedStep('Go forward', () => this.page.goForward());
  }

  currentUrl(): string {
    return this.page.url();
  }

  async title(): Promise<string> {
    return this.page.title();
  }

  // ---- actions ----

  async click(locator: Locator, options?: Parameters<Locator['click']>[0]): Promise<void> {
    await loggedStep(`Click -> ${describe(locator)}`, () => locator.click(options));
  }

  async dblClick(locator: Locator): Promise<void> {
    await loggedStep(`Double-click -> ${describe(locator)}`, () => locator.dblclick());
  }

  async rightClick(locator: Locator): Promise<void> {
    await loggedStep(`Right-click -> ${describe(locator)}`, () =>
      locator.click({ button: 'right' }),
    );
  }

  async fill(locator: Locator, value: string): Promise<void> {
    await loggedStep(`Fill "${value}" -> ${describe(locator)}`, () => locator.fill(value));
  }

  /** Types character-by-character (real keydown/keyup events) instead of setting the value directly. */
  async type(locator: Locator, value: string): Promise<void> {
    await loggedStep(`Type "${value}" -> ${describe(locator)}`, () =>
      locator.pressSequentially(value),
    );
  }

  async clear(locator: Locator): Promise<void> {
    await loggedStep(`Clear -> ${describe(locator)}`, () => locator.clear());
  }

  async check(locator: Locator): Promise<void> {
    await loggedStep(`Check -> ${describe(locator)}`, () => locator.check());
  }

  async uncheck(locator: Locator): Promise<void> {
    await loggedStep(`Uncheck -> ${describe(locator)}`, () => locator.uncheck());
  }

  async selectOption(
    locator: Locator,
    value: string | string[] | { label: string } | { index: number },
  ): Promise<void> {
    await loggedStep(`Select "${JSON.stringify(value)}" -> ${describe(locator)}`, () =>
      locator.selectOption(value),
    );
  }

  async hover(locator: Locator): Promise<void> {
    await loggedStep(`Hover -> ${describe(locator)}`, () => locator.hover());
  }

  async dragAndDrop(source: Locator, target: Locator): Promise<void> {
    await loggedStep(`Drag ${describe(source)} -> ${describe(target)}`, () =>
      source.dragTo(target),
    );
  }

  async pressKey(locator: Locator, key: string): Promise<void> {
    await loggedStep(`Press "${key}" -> ${describe(locator)}`, () => locator.press(key));
  }

  async focus(locator: Locator): Promise<void> {
    await loggedStep(`Focus -> ${describe(locator)}`, () => locator.focus());
  }

  async uploadFile(locator: Locator, filePaths: string | string[]): Promise<void> {
    await loggedStep(`Upload file(s) -> ${describe(locator)}`, () =>
      locator.setInputFiles(filePaths),
    );
  }

  // ---- reads ----

  async getText(locator: Locator): Promise<string> {
    return (await locator.innerText()).trim();
  }

  async getValue(locator: Locator): Promise<string> {
    return locator.inputValue();
  }

  async getAttribute(locator: Locator, name: string): Promise<string | null> {
    return locator.getAttribute(name);
  }

  async isVisible(locator: Locator): Promise<boolean> {
    return locator.isVisible();
  }

  async isEnabled(locator: Locator): Promise<boolean> {
    return locator.isEnabled();
  }

  async isChecked(locator: Locator): Promise<boolean> {
    return locator.isChecked();
  }

  async count(locator: Locator): Promise<number> {
    return locator.count();
  }

  async allText(locator: Locator): Promise<string[]> {
    return locator.allInnerTexts();
  }

  // ---- explicit waits (Playwright auto-waits on actions; these are for
  // conditions no single action covers) ----

  async waitForVisible(locator: Locator, timeoutMs?: number): Promise<void> {
    await locator.waitFor({ state: 'visible', timeout: timeoutMs });
  }

  async waitForHidden(locator: Locator, timeoutMs?: number): Promise<void> {
    await locator.waitFor({ state: 'hidden', timeout: timeoutMs });
  }

  async waitForUrlContains(fragment: string, timeoutMs?: number): Promise<void> {
    await this.page.waitForURL((url) => url.toString().includes(fragment), {
      timeout: timeoutMs,
    });
  }

  async waitForLoadState(state: 'load' | 'domcontentloaded' | 'networkidle' = 'load'): Promise<void> {
    await this.page.waitForLoadState(state);
  }

  /** Waits for a response whose URL matches, without triggering a new navigation - use around the action that fires it. */
  async waitForResponseMatching(
    urlPattern: string | RegExp,
    action: () => Promise<void>,
  ): Promise<Response> {
    const [response] = await Promise.all([this.page.waitForResponse(urlPattern), action()]);
    return response;
  }

  // ---- screenshots ----

  async screenshotPage(name: string): Promise<Buffer> {
    logger.info(`Screenshot (full page): ${name}`);
    return this.page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
  }

  async screenshotElement(locator: Locator, name: string): Promise<Buffer> {
    logger.info(`Screenshot (element): ${name}`);
    return locator.screenshot({ path: `screenshots/${name}.png` });
  }

  // ---- frames ----

  frame(selector: string): FrameLocator {
    return this.page.frameLocator(selector);
  }

  // ---- new tabs / popups ----

  /** Runs `action` (e.g. clicking a "open in new tab" link) and returns the tab it opens. */
  async waitForNewTab(action: () => Promise<void>): Promise<Page> {
    const [popup] = await Promise.all([this.page.waitForEvent('popup'), action()]);
    await popup.waitForLoadState();
    return popup;
  }

  // ---- downloads ----

  /** Runs `action` (e.g. clicking a download link) and saves the resulting file to `savePath`. */
  async downloadFile(action: () => Promise<void>, savePath: string): Promise<Download> {
    const [download] = await Promise.all([this.page.waitForEvent('download'), action()]);
    await download.saveAs(savePath);
    return download;
  }

  // ---- network mocking ----

  /** Fulfils every request matching `urlPattern` with `response` instead of hitting the network. */
  async mockRoute(
    urlPattern: string | RegExp,
    response: { status?: number; contentType?: string; body: string },
  ): Promise<void> {
    await this.page.route(urlPattern, (route) =>
      route.fulfill({
        status: response.status ?? 200,
        contentType: response.contentType ?? 'application/json',
        body: response.body,
      }),
    );
  }

  /** Aborts every request matching `urlPattern` - useful for simulating a failed dependency. */
  async blockRoute(urlPattern: string | RegExp): Promise<void> {
    await this.page.route(urlPattern, (route) => route.abort());
  }

  async unrouteAll(): Promise<void> {
    await this.page.unrouteAll();
  }
}

function describe(locator: Locator): string {
  return locator.toString();
}
