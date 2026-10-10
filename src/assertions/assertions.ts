import { AsyncLocalStorage } from 'node:async_hooks';
import { expect, type Locator, type Page } from '@playwright/test';
import { step } from '../base/step';
import type { AriaRole } from '../locators/types';

/**
 * Logged wrappers around Playwright's own auto-retrying `pick()(locator)`/
 * `pick()(page)` assertions - every one shows up in the step/trace report
 * and the shared logger exactly like an `actions.*` call does, so a spec
 * reads as one consistent stream of steps instead of mixing `actions.foo()`
 * calls with bare `expect(...)` calls.
 *
 * These cover the common, stable subset of Playwright's assertion API.
 * `toHaveScreenshot`/`toMatchAriaSnapshot` (visual/snapshot baselines) and
 * the rarer `signal` (AbortSignal) option are intentionally not wrapped -
 * call `pick()(locator)`/`pick()(page)` directly for those; nothing here
 * hides or replaces Playwright's own `expect`.
 */

function describe(locator: Locator): string {
  return locator.toString();
}

/**
 * Soft assertions: inside `softly(...)` every assertion in this module records its failure and carries on instead of
 * stopping the test at the first one, so a page check reports ALL that is wrong at once. The test still fails at the end.
 * An AsyncLocalStorage scope, so it is safe with parallel steps and never leaks into the next test.
 */
const softScope = new AsyncLocalStorage<boolean>();
const softExpect = expect.configure({ soft: true });
const pick = (): typeof expect => (softScope.getStore() ? softExpect : expect);

export function softly<T>(checks: () => Promise<T>): Promise<T> {
  return softScope.run(true, checks);
}

export interface AssertOptions {
  /** Overrides the default assertion timeout (`expect.timeout` in playwright.config.ts) for this call only. */
  timeout?: number;
}

// ---- state ----

export async function toBeAttached(locator: Locator, options?: AssertOptions & { attached?: boolean }): Promise<void> {
  await step(`Assert attached -> ${describe(locator)}`, () => pick()(locator).toBeAttached(options));
}

export async function toBeVisible(locator: Locator, options?: AssertOptions & { visible?: boolean }): Promise<void> {
  await step(`Assert visible -> ${describe(locator)}`, () => pick()(locator).toBeVisible(options));
}

export async function toBeHidden(locator: Locator, options?: AssertOptions): Promise<void> {
  await step(`Assert hidden -> ${describe(locator)}`, () => pick()(locator).toBeHidden(options));
}

export async function toBeEnabled(locator: Locator, options?: AssertOptions): Promise<void> {
  await step(`Assert enabled -> ${describe(locator)}`, () => pick()(locator).toBeEnabled(options));
}

export async function toBeDisabled(locator: Locator, options?: AssertOptions): Promise<void> {
  await step(`Assert disabled -> ${describe(locator)}`, () => pick()(locator).toBeDisabled(options));
}

export async function toBeChecked(
  locator: Locator,
  options?: AssertOptions & { checked?: boolean; indeterminate?: boolean },
): Promise<void> {
  await step(`Assert checked -> ${describe(locator)}`, () => pick()(locator).toBeChecked(options));
}

export async function toBeEditable(locator: Locator, options?: AssertOptions & { editable?: boolean }): Promise<void> {
  await step(`Assert editable -> ${describe(locator)}`, () => pick()(locator).toBeEditable(options));
}

export async function toBeEmpty(locator: Locator, options?: AssertOptions): Promise<void> {
  await step(`Assert empty -> ${describe(locator)}`, () => pick()(locator).toBeEmpty(options));
}

export async function toBeFocused(locator: Locator, options?: AssertOptions): Promise<void> {
  await step(`Assert focused -> ${describe(locator)}`, () => pick()(locator).toBeFocused(options));
}

export async function toBeInViewport(locator: Locator, options?: AssertOptions & { ratio?: number }): Promise<void> {
  await step(`Assert in viewport -> ${describe(locator)}`, () => pick()(locator).toBeInViewport(options));
}

// ---- content ----

export async function toContainText(
  locator: Locator,
  expected: string | RegExp | (string | RegExp)[],
  options?: AssertOptions & { ignoreCase?: boolean; useInnerText?: boolean },
): Promise<void> {
  await step(`Assert contains text "${expected}" -> ${describe(locator)}`, () =>
    pick()(locator).toContainText(expected, options),
  );
}

export async function toHaveText(
  locator: Locator,
  expected: string | RegExp | (string | RegExp)[],
  options?: AssertOptions & { ignoreCase?: boolean; useInnerText?: boolean },
): Promise<void> {
  await step(`Assert text "${expected}" -> ${describe(locator)}`, () => pick()(locator).toHaveText(expected, options));
}

export async function toHaveValue(locator: Locator, expected: string | RegExp, options?: AssertOptions): Promise<void> {
  await step(`Assert value "${expected}" -> ${describe(locator)}`, () => pick()(locator).toHaveValue(expected, options));
}

export async function toHaveValues(
  locator: Locator,
  expected: (string | RegExp)[],
  options?: AssertOptions,
): Promise<void> {
  await step(`Assert values [${expected}] -> ${describe(locator)}`, () => pick()(locator).toHaveValues(expected, options));
}

// ---- attributes / properties / style ----

export async function toHaveAttribute(
  locator: Locator,
  name: string,
  value?: string | RegExp,
  options?: AssertOptions & { ignoreCase?: boolean },
): Promise<void> {
  const label = value !== undefined ? `${name}="${value}"` : `${name} (present)`;
  await step(`Assert attribute ${label} -> ${describe(locator)}`, () =>
    value !== undefined ? pick()(locator).toHaveAttribute(name, value, options) : pick()(locator).toHaveAttribute(name, options),
  );
}

export async function toHaveClass(
  locator: Locator,
  expected: string | RegExp | (string | RegExp)[],
  options?: AssertOptions,
): Promise<void> {
  await step(`Assert class "${expected}" -> ${describe(locator)}`, () => pick()(locator).toHaveClass(expected, options));
}

export async function toContainClass(
  locator: Locator,
  expected: string | string[],
  options?: AssertOptions,
): Promise<void> {
  await step(`Assert contains class "${expected}" -> ${describe(locator)}`, () =>
    pick()(locator).toContainClass(expected, options),
  );
}

export async function toHaveCSS(
  locator: Locator,
  name: string,
  value: string | RegExp,
  options?: AssertOptions,
): Promise<void> {
  await step(`Assert CSS ${name}="${value}" -> ${describe(locator)}`, () => pick()(locator).toHaveCSS(name, value, options));
}

export async function toHaveId(locator: Locator, expected: string | RegExp, options?: AssertOptions): Promise<void> {
  await step(`Assert id "${expected}" -> ${describe(locator)}`, () => pick()(locator).toHaveId(expected, options));
}

export async function toHaveJSProperty(
  locator: Locator,
  name: string,
  value: unknown,
  options?: AssertOptions,
): Promise<void> {
  await step(`Assert JS property ${name} -> ${describe(locator)}`, () => pick()(locator).toHaveJSProperty(name, value, options));
}

export async function toHaveCount(locator: Locator, count: number, options?: AssertOptions): Promise<void> {
  await step(`Assert count = ${count} -> ${describe(locator)}`, () => pick()(locator).toHaveCount(count, options));
}

// ---- accessibility ----

export async function toHaveRole(locator: Locator, role: AriaRole, options?: AssertOptions): Promise<void> {
  await step(`Assert role "${role}" -> ${describe(locator)}`, () => pick()(locator).toHaveRole(role, options));
}

export async function toHaveAccessibleName(
  locator: Locator,
  expected: string | RegExp,
  options?: AssertOptions & { ignoreCase?: boolean },
): Promise<void> {
  await step(`Assert accessible name "${expected}" -> ${describe(locator)}`, () =>
    pick()(locator).toHaveAccessibleName(expected, options),
  );
}

export async function toHaveAccessibleDescription(
  locator: Locator,
  expected: string | RegExp,
  options?: AssertOptions & { ignoreCase?: boolean },
): Promise<void> {
  await step(`Assert accessible description "${expected}" -> ${describe(locator)}`, () =>
    pick()(locator).toHaveAccessibleDescription(expected, options),
  );
}

export async function toHaveAccessibleErrorMessage(
  locator: Locator,
  expected: string | RegExp,
  options?: AssertOptions,
): Promise<void> {
  await step(`Assert accessible error message "${expected}" -> ${describe(locator)}`, () =>
    pick()(locator).toHaveAccessibleErrorMessage(expected, options),
  );
}

// ---- page-level ----

export async function toHaveTitle(page: Page, expected: string | RegExp, options?: AssertOptions): Promise<void> {
  await step(`Assert page title "${expected}"`, () => pick()(page).toHaveTitle(expected, options));
}

export async function toHaveURL(page: Page, expected: string | RegExp, options?: AssertOptions): Promise<void> {
  await step(`Assert page URL "${expected}"`, () => pick()(page).toHaveURL(expected, options));
}

// ---- visual and structural baselines ----

export interface ScreenshotAssertOptions extends AssertOptions {
  /** Elements whose content changes between runs (dates, ads, avatars): painted over before comparing. */
  mask?: Locator[];
  /** How many pixels may differ. */
  maxDiffPixels?: number;
  maxDiffPixelRatio?: number;
  /** Per-pixel colour tolerance, 0 (strict) - 1. Playwright's default is 0.2. */
  threshold?: number;
  fullPage?: boolean;
  /** CSS animations and transitions are frozen by default ('disabled') - without it any animated page flaps. */
  animations?: 'disabled' | 'allow';
  /** Path of a stylesheet applied while capturing, e.g. to hide a chat widget. */
  stylePath?: string | string[];
}

/** Compares a screenshot of the element or page with the stored baseline (created on the first run; `--update-snapshots` accepts a change). Animations are frozen and the caret hidden by default. */
export async function toHaveScreenshot(target: Locator | Page, name: string | string[], options: ScreenshotAssertOptions = {}): Promise<void> {
  const label = 'toString' in target && typeof (target as Locator).first === 'function' ? describe(target as Locator) : 'page';
  await step(`Assert screenshot "${Array.isArray(name) ? name.join('/') : name}" -> ${label}`, () =>
    (pick()(target as Locator) as ReturnType<typeof expect<Locator>>).toHaveScreenshot(name, { animations: 'disabled', caret: 'hide', ...options }),
  );
}

/**
 * Compares the accessibility tree (roles, names, structure) with a YAML template - broad structural coverage that
 * survives restyling: `- heading "Orders" [level=1]`, `- button /Save|Submit/`, `- list:\n  - listitem: Ada`.
 * Pass the template, or `{ name: 'orders.aria.yml' }` to keep it in a file. Missing parts of the template are not checked.
 */
export async function toMatchAriaSnapshot(target: Locator | Page, template: string | { name: string }, options?: AssertOptions): Promise<void> {
  const label = 'toString' in target && typeof (target as Locator).first === 'function' ? describe(target as Locator) : 'page';
  await step(`Assert ARIA snapshot -> ${label}`, () => {
    const assertion = pick()(target as Locator) as ReturnType<typeof expect<Locator>>;
    return typeof template === 'string' ? assertion.toMatchAriaSnapshot(template, options) : assertion.toMatchAriaSnapshot({ name: template.name, ...options });
  });
}

// ---- conditions that are not an element ----

export interface EventuallyOptions {
  /** Give up after this long. Default: the configured assertion timeout is NOT used - the default here is 10 s. */
  timeout?: number;
  /** Waits between tries; the last repeats. Default 100, 250, 500, 1000 ms. */
  intervals?: number[];
}

/**
 * Retries a block of assertions until it passes, then returns - for a condition made of several reads, or one that
 * is not an element (a total that settles, two lists that must agree):
 *
 *   await assertions.eventually(async () => {
 *     expect(await actions.count(rows)).toBe(3);
 *     expect(await actions.getText(total)).toBe('$30');
 *   });
 */
export async function eventually(block: () => Promise<void>, options: EventuallyOptions = {}): Promise<void> {
  await step('Assert eventually', () => expect(block).toPass({ timeout: options.timeout ?? 10_000, intervals: options.intervals }));
}

/** Polls a value until it equals `expected` (deep equality) - `await assertions.pollValue(() => api.orderState(id), 'SHIPPED')`. */
export async function pollValue<T>(read: () => Promise<T> | T, expected: T, options: EventuallyOptions & { message?: string } = {}): Promise<void> {
  await step(`Assert value becomes ${JSON.stringify(expected)}`, () =>
    expect.poll(async () => read(), { timeout: options.timeout ?? 10_000, intervals: options.intervals, message: options.message }).toEqual(expected),
  );
}

// ---- negated (`assertions.not.*`) ----

export const not = {
  async toBeVisible(locator: Locator, options?: AssertOptions): Promise<void> {
    await step(`Assert NOT visible -> ${describe(locator)}`, () => pick()(locator).not.toBeVisible(options));
  },
  async toBeHidden(locator: Locator, options?: AssertOptions): Promise<void> {
    await step(`Assert NOT hidden -> ${describe(locator)}`, () => pick()(locator).not.toBeHidden(options));
  },
  async toBeEnabled(locator: Locator, options?: AssertOptions): Promise<void> {
    await step(`Assert NOT enabled -> ${describe(locator)}`, () => pick()(locator).not.toBeEnabled(options));
  },
  async toBeDisabled(locator: Locator, options?: AssertOptions): Promise<void> {
    await step(`Assert NOT disabled -> ${describe(locator)}`, () => pick()(locator).not.toBeDisabled(options));
  },
  async toBeChecked(locator: Locator, options?: AssertOptions & { checked?: boolean }): Promise<void> {
    await step(`Assert NOT checked -> ${describe(locator)}`, () => pick()(locator).not.toBeChecked(options));
  },
  async toBeAttached(locator: Locator, options?: AssertOptions): Promise<void> {
    await step(`Assert NOT attached -> ${describe(locator)}`, () => pick()(locator).not.toBeAttached(options));
  },
  async toContainText(
    locator: Locator,
    expected: string | RegExp | (string | RegExp)[],
    options?: AssertOptions & { ignoreCase?: boolean; useInnerText?: boolean },
  ): Promise<void> {
    await step(`Assert NOT contains text "${expected}" -> ${describe(locator)}`, () =>
      pick()(locator).not.toContainText(expected, options),
    );
  },
  async toHaveText(
    locator: Locator,
    expected: string | RegExp | (string | RegExp)[],
    options?: AssertOptions & { ignoreCase?: boolean; useInnerText?: boolean },
  ): Promise<void> {
    await step(`Assert NOT text "${expected}" -> ${describe(locator)}`, () => pick()(locator).not.toHaveText(expected, options));
  },
  async toHaveValue(locator: Locator, expected: string | RegExp, options?: AssertOptions): Promise<void> {
    await step(`Assert NOT value "${expected}" -> ${describe(locator)}`, () => pick()(locator).not.toHaveValue(expected, options));
  },
  async toHaveAttribute(
    locator: Locator,
    name: string,
    value?: string | RegExp,
    options?: AssertOptions & { ignoreCase?: boolean },
  ): Promise<void> {
    const label = value !== undefined ? `${name}="${value}"` : `${name} (present)`;
    await step(`Assert NOT attribute ${label} -> ${describe(locator)}`, () =>
      value !== undefined
        ? pick()(locator).not.toHaveAttribute(name, value, options)
        : pick()(locator).not.toHaveAttribute(name, options),
    );
  },
  async toHaveClass(
    locator: Locator,
    expected: string | RegExp | (string | RegExp)[],
    options?: AssertOptions,
  ): Promise<void> {
    await step(`Assert NOT class "${expected}" -> ${describe(locator)}`, () => pick()(locator).not.toHaveClass(expected, options));
  },
  async toHaveCount(locator: Locator, count: number, options?: AssertOptions): Promise<void> {
    await step(`Assert NOT count = ${count} -> ${describe(locator)}`, () => pick()(locator).not.toHaveCount(count, options));
  },
  async toHaveTitle(page: Page, expected: string | RegExp, options?: AssertOptions): Promise<void> {
    await step(`Assert page title NOT "${expected}"`, () => pick()(page).not.toHaveTitle(expected, options));
  },
  async toHaveURL(page: Page, expected: string | RegExp, options?: AssertOptions): Promise<void> {
    await step(`Assert page URL NOT "${expected}"`, () => pick()(page).not.toHaveURL(expected, options));
  },
};
