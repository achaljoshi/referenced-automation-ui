import { expect, type Locator, type Page } from '@playwright/test';
import { step } from '../base/step';
import type { AriaRole } from '../locators/types';

/**
 * Logged wrappers around Playwright's own auto-retrying `expect(locator)`/
 * `expect(page)` assertions - every one shows up in the step/trace report
 * and the shared logger exactly like an `actions.*` call does, so a spec
 * reads as one consistent stream of steps instead of mixing `actions.foo()`
 * calls with bare `expect(...)` calls.
 *
 * These cover the common, stable subset of Playwright's assertion API.
 * `toHaveScreenshot`/`toMatchAriaSnapshot` (visual/snapshot baselines) and
 * the rarer `signal` (AbortSignal) option are intentionally not wrapped -
 * call `expect(locator)`/`expect(page)` directly for those; nothing here
 * hides or replaces Playwright's own `expect`.
 */

function describe(locator: Locator): string {
  return locator.toString();
}

export interface AssertOptions {
  /** Overrides the default assertion timeout (`expect.timeout` in playwright.config.ts) for this call only. */
  timeout?: number;
}

// ---- state ----

export async function toBeAttached(locator: Locator, options?: AssertOptions & { attached?: boolean }): Promise<void> {
  await step(`Assert attached -> ${describe(locator)}`, () => expect(locator).toBeAttached(options));
}

export async function toBeVisible(locator: Locator, options?: AssertOptions & { visible?: boolean }): Promise<void> {
  await step(`Assert visible -> ${describe(locator)}`, () => expect(locator).toBeVisible(options));
}

export async function toBeHidden(locator: Locator, options?: AssertOptions): Promise<void> {
  await step(`Assert hidden -> ${describe(locator)}`, () => expect(locator).toBeHidden(options));
}

export async function toBeEnabled(locator: Locator, options?: AssertOptions): Promise<void> {
  await step(`Assert enabled -> ${describe(locator)}`, () => expect(locator).toBeEnabled(options));
}

export async function toBeDisabled(locator: Locator, options?: AssertOptions): Promise<void> {
  await step(`Assert disabled -> ${describe(locator)}`, () => expect(locator).toBeDisabled(options));
}

export async function toBeChecked(
  locator: Locator,
  options?: AssertOptions & { checked?: boolean; indeterminate?: boolean },
): Promise<void> {
  await step(`Assert checked -> ${describe(locator)}`, () => expect(locator).toBeChecked(options));
}

export async function toBeEditable(locator: Locator, options?: AssertOptions & { editable?: boolean }): Promise<void> {
  await step(`Assert editable -> ${describe(locator)}`, () => expect(locator).toBeEditable(options));
}

export async function toBeEmpty(locator: Locator, options?: AssertOptions): Promise<void> {
  await step(`Assert empty -> ${describe(locator)}`, () => expect(locator).toBeEmpty(options));
}

export async function toBeFocused(locator: Locator, options?: AssertOptions): Promise<void> {
  await step(`Assert focused -> ${describe(locator)}`, () => expect(locator).toBeFocused(options));
}

export async function toBeInViewport(locator: Locator, options?: AssertOptions & { ratio?: number }): Promise<void> {
  await step(`Assert in viewport -> ${describe(locator)}`, () => expect(locator).toBeInViewport(options));
}

// ---- content ----

export async function toContainText(
  locator: Locator,
  expected: string | RegExp | (string | RegExp)[],
  options?: AssertOptions & { ignoreCase?: boolean; useInnerText?: boolean },
): Promise<void> {
  await step(`Assert contains text "${expected}" -> ${describe(locator)}`, () =>
    expect(locator).toContainText(expected, options),
  );
}

export async function toHaveText(
  locator: Locator,
  expected: string | RegExp | (string | RegExp)[],
  options?: AssertOptions & { ignoreCase?: boolean; useInnerText?: boolean },
): Promise<void> {
  await step(`Assert text "${expected}" -> ${describe(locator)}`, () => expect(locator).toHaveText(expected, options));
}

export async function toHaveValue(locator: Locator, expected: string | RegExp, options?: AssertOptions): Promise<void> {
  await step(`Assert value "${expected}" -> ${describe(locator)}`, () => expect(locator).toHaveValue(expected, options));
}

export async function toHaveValues(
  locator: Locator,
  expected: (string | RegExp)[],
  options?: AssertOptions,
): Promise<void> {
  await step(`Assert values [${expected}] -> ${describe(locator)}`, () => expect(locator).toHaveValues(expected, options));
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
    value !== undefined ? expect(locator).toHaveAttribute(name, value, options) : expect(locator).toHaveAttribute(name, options),
  );
}

export async function toHaveClass(
  locator: Locator,
  expected: string | RegExp | (string | RegExp)[],
  options?: AssertOptions,
): Promise<void> {
  await step(`Assert class "${expected}" -> ${describe(locator)}`, () => expect(locator).toHaveClass(expected, options));
}

export async function toContainClass(
  locator: Locator,
  expected: string | string[],
  options?: AssertOptions,
): Promise<void> {
  await step(`Assert contains class "${expected}" -> ${describe(locator)}`, () =>
    expect(locator).toContainClass(expected, options),
  );
}

export async function toHaveCSS(
  locator: Locator,
  name: string,
  value: string | RegExp,
  options?: AssertOptions,
): Promise<void> {
  await step(`Assert CSS ${name}="${value}" -> ${describe(locator)}`, () => expect(locator).toHaveCSS(name, value, options));
}

export async function toHaveId(locator: Locator, expected: string | RegExp, options?: AssertOptions): Promise<void> {
  await step(`Assert id "${expected}" -> ${describe(locator)}`, () => expect(locator).toHaveId(expected, options));
}

export async function toHaveJSProperty(
  locator: Locator,
  name: string,
  value: unknown,
  options?: AssertOptions,
): Promise<void> {
  await step(`Assert JS property ${name} -> ${describe(locator)}`, () => expect(locator).toHaveJSProperty(name, value, options));
}

export async function toHaveCount(locator: Locator, count: number, options?: AssertOptions): Promise<void> {
  await step(`Assert count = ${count} -> ${describe(locator)}`, () => expect(locator).toHaveCount(count, options));
}

// ---- accessibility ----

export async function toHaveRole(locator: Locator, role: AriaRole, options?: AssertOptions): Promise<void> {
  await step(`Assert role "${role}" -> ${describe(locator)}`, () => expect(locator).toHaveRole(role, options));
}

export async function toHaveAccessibleName(
  locator: Locator,
  expected: string | RegExp,
  options?: AssertOptions & { ignoreCase?: boolean },
): Promise<void> {
  await step(`Assert accessible name "${expected}" -> ${describe(locator)}`, () =>
    expect(locator).toHaveAccessibleName(expected, options),
  );
}

export async function toHaveAccessibleDescription(
  locator: Locator,
  expected: string | RegExp,
  options?: AssertOptions & { ignoreCase?: boolean },
): Promise<void> {
  await step(`Assert accessible description "${expected}" -> ${describe(locator)}`, () =>
    expect(locator).toHaveAccessibleDescription(expected, options),
  );
}

export async function toHaveAccessibleErrorMessage(
  locator: Locator,
  expected: string | RegExp,
  options?: AssertOptions,
): Promise<void> {
  await step(`Assert accessible error message "${expected}" -> ${describe(locator)}`, () =>
    expect(locator).toHaveAccessibleErrorMessage(expected, options),
  );
}

// ---- page-level ----

export async function toHaveTitle(page: Page, expected: string | RegExp, options?: AssertOptions): Promise<void> {
  await step(`Assert page title "${expected}"`, () => expect(page).toHaveTitle(expected, options));
}

export async function toHaveURL(page: Page, expected: string | RegExp, options?: AssertOptions): Promise<void> {
  await step(`Assert page URL "${expected}"`, () => expect(page).toHaveURL(expected, options));
}

// ---- negated (`assertions.not.*`) ----

export const not = {
  async toBeVisible(locator: Locator, options?: AssertOptions): Promise<void> {
    await step(`Assert NOT visible -> ${describe(locator)}`, () => expect(locator).not.toBeVisible(options));
  },
  async toBeHidden(locator: Locator, options?: AssertOptions): Promise<void> {
    await step(`Assert NOT hidden -> ${describe(locator)}`, () => expect(locator).not.toBeHidden(options));
  },
  async toBeEnabled(locator: Locator, options?: AssertOptions): Promise<void> {
    await step(`Assert NOT enabled -> ${describe(locator)}`, () => expect(locator).not.toBeEnabled(options));
  },
  async toBeDisabled(locator: Locator, options?: AssertOptions): Promise<void> {
    await step(`Assert NOT disabled -> ${describe(locator)}`, () => expect(locator).not.toBeDisabled(options));
  },
  async toBeChecked(locator: Locator, options?: AssertOptions & { checked?: boolean }): Promise<void> {
    await step(`Assert NOT checked -> ${describe(locator)}`, () => expect(locator).not.toBeChecked(options));
  },
  async toBeAttached(locator: Locator, options?: AssertOptions): Promise<void> {
    await step(`Assert NOT attached -> ${describe(locator)}`, () => expect(locator).not.toBeAttached(options));
  },
  async toContainText(
    locator: Locator,
    expected: string | RegExp | (string | RegExp)[],
    options?: AssertOptions & { ignoreCase?: boolean; useInnerText?: boolean },
  ): Promise<void> {
    await step(`Assert NOT contains text "${expected}" -> ${describe(locator)}`, () =>
      expect(locator).not.toContainText(expected, options),
    );
  },
  async toHaveText(
    locator: Locator,
    expected: string | RegExp | (string | RegExp)[],
    options?: AssertOptions & { ignoreCase?: boolean; useInnerText?: boolean },
  ): Promise<void> {
    await step(`Assert NOT text "${expected}" -> ${describe(locator)}`, () => expect(locator).not.toHaveText(expected, options));
  },
  async toHaveValue(locator: Locator, expected: string | RegExp, options?: AssertOptions): Promise<void> {
    await step(`Assert NOT value "${expected}" -> ${describe(locator)}`, () => expect(locator).not.toHaveValue(expected, options));
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
        ? expect(locator).not.toHaveAttribute(name, value, options)
        : expect(locator).not.toHaveAttribute(name, options),
    );
  },
  async toHaveClass(
    locator: Locator,
    expected: string | RegExp | (string | RegExp)[],
    options?: AssertOptions,
  ): Promise<void> {
    await step(`Assert NOT class "${expected}" -> ${describe(locator)}`, () => expect(locator).not.toHaveClass(expected, options));
  },
  async toHaveCount(locator: Locator, count: number, options?: AssertOptions): Promise<void> {
    await step(`Assert NOT count = ${count} -> ${describe(locator)}`, () => expect(locator).not.toHaveCount(count, options));
  },
  async toHaveTitle(page: Page, expected: string | RegExp, options?: AssertOptions): Promise<void> {
    await step(`Assert page title NOT "${expected}"`, () => expect(page).not.toHaveTitle(expected, options));
  },
  async toHaveURL(page: Page, expected: string | RegExp, options?: AssertOptions): Promise<void> {
    await step(`Assert page URL NOT "${expected}"`, () => expect(page).not.toHaveURL(expected, options));
  },
};
