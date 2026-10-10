/// <reference lib="dom" />
import type { BrowserContext, Page } from '@playwright/test';
import { step } from '../base/step';

/** Runs a function in the page and returns its (serializable) result. Test code and page code do not share variables: pass values in as `arg`. */
export async function evaluate<R>(page: Page, fn: (arg: any) => R | Promise<R>, arg?: unknown): Promise<R> {
  return page.evaluate(fn as (arg: unknown) => R | Promise<R>, arg);
}

/** Waits until a function evaluated in the page returns something truthy - for state no element shows (`window.appReady`, a store value). Not a sleep: it returns the moment it is true. */
export async function waitForPageFunction(page: Page, fn: (arg: any) => unknown, arg?: unknown, timeoutMs?: number): Promise<void> {
  await step('Wait for page condition', () => page.waitForFunction(fn as (arg: unknown) => unknown, arg, { timeout: timeoutMs }).then(() => undefined));
}

/** Runs a script in every page BEFORE any of the page's own scripts, on each navigation - to mock a browser API or seed state. */
export async function addInitScript(target: Page | BrowserContext, script: ((arg: any) => void) | { path: string }, arg?: unknown): Promise<void> {
  await step('Add init script', () => target.addInitScript(script as (arg: unknown) => void, arg));
}

/** Makes a Node function callable from the page as `window.<name>(...)`: the page reports back to the test. */
export async function exposeFunction(page: Page, name: string, fn: (...args: any[]) => unknown): Promise<void> {
  await step(`Expose function ${name}`, () => page.exposeFunction(name, fn));
}

/** Replaces a `navigator` property (language, onLine, cookieEnabled, hardwareConcurrency ...) before the page loads. */
export async function mockNavigatorProperty(target: Page | BrowserContext, property: string, value: unknown): Promise<void> {
  await addInitScript(
    target,
    ([prop, val]: [string, unknown]) => {
      Object.defineProperty(Object.getPrototypeOf(navigator), prop, { get: () => val, configurable: true });
    },
    [property, value],
  );
}

/** Records calls to `window.open`, and stops it opening anything - to assert "this opens that URL" without a popup. Read the calls with `openedWindows(page)`. */
export async function stubWindowOpen(target: Page | BrowserContext): Promise<void> {
  await addInitScript(target, () => {
    (window as unknown as { __opened: unknown[][] }).__opened = [];
    window.open = (...args: unknown[]) => {
      (window as unknown as { __opened: unknown[][] }).__opened.push(args);
      return null;
    };
  });
}

export async function openedWindows(page: Page): Promise<unknown[][]> {
  return page.evaluate(() => (window as unknown as { __opened?: unknown[][] }).__opened ?? []);
}

/** Replaces the clipboard with an in-page fake: writes are captured, reads return what you set - works without clipboard permissions or a focused window. */
export async function mockClipboard(target: Page | BrowserContext, initial = ''): Promise<void> {
  await addInitScript(target, (text: string) => {
    let value = text;
    const fake = { writeText: async (t: string) => void (value = t), readText: async () => value };
    Object.defineProperty(navigator, 'clipboard', { value: fake, configurable: true });
  }, initial);
}

export async function readMockClipboard(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText());
}
