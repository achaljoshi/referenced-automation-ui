import { expect, type Locator } from '@playwright/test';
import { logger } from '@automation/referenced-automation-utils';
import { step } from '../base/step';

/**
 * Element-level actions - every one takes the Locator to act on explicitly,
 * rather than being a method on some page-specific object, so any page
 * object (however it's structured) reuses the exact same logged,
 * consistent behaviour instead of reimplementing "click and log it" itself.
 */

function describe(locator: Locator): string {
  return locator.toString();
}

export async function click(locator: Locator, options?: Parameters<Locator['click']>[0]): Promise<void> {
  await step(`Click -> ${describe(locator)}`, () => locator.click(options));
}

export async function dblClick(locator: Locator): Promise<void> {
  await step(`Double-click -> ${describe(locator)}`, () => locator.dblclick());
}

export async function rightClick(locator: Locator): Promise<void> {
  await step(`Right-click -> ${describe(locator)}`, () => locator.click({ button: 'right' }));
}

export async function fill(locator: Locator, value: string): Promise<void> {
  await step(`Fill "${value}" -> ${describe(locator)}`, () => locator.fill(value));
}

/** Types character-by-character (real keydown/keyup events) instead of setting the value directly. */
export async function type(locator: Locator, value: string): Promise<void> {
  await step(`Type "${value}" -> ${describe(locator)}`, () => locator.pressSequentially(value));
}

export async function clear(locator: Locator): Promise<void> {
  await step(`Clear -> ${describe(locator)}`, () => locator.clear());
}

export async function check(locator: Locator): Promise<void> {
  await step(`Check -> ${describe(locator)}`, () => locator.check());
}

export async function uncheck(locator: Locator): Promise<void> {
  await step(`Uncheck -> ${describe(locator)}`, () => locator.uncheck());
}

export async function selectOption(
  locator: Locator,
  value: string | string[] | { label: string } | { index: number },
): Promise<void> {
  await step(`Select "${JSON.stringify(value)}" -> ${describe(locator)}`, () =>
    locator.selectOption(value),
  );
}

export async function hover(locator: Locator): Promise<void> {
  await step(`Hover -> ${describe(locator)}`, () => locator.hover());
}

export async function dragAndDrop(source: Locator, target: Locator): Promise<void> {
  await step(`Drag ${describe(source)} -> ${describe(target)}`, () => source.dragTo(target));
}

export async function pressKey(locator: Locator, key: string): Promise<void> {
  await step(`Press "${key}" -> ${describe(locator)}`, () => locator.press(key));
}

export async function focus(locator: Locator): Promise<void> {
  await step(`Focus -> ${describe(locator)}`, () => locator.focus());
}

export async function uploadFile(locator: Locator, filePaths: string | string[]): Promise<void> {
  await step(`Upload file(s) -> ${describe(locator)}`, () => locator.setInputFiles(filePaths));
}

// ---- reads (not logged as steps - not user actions, just assertions/setup reading state) ----

export async function getText(locator: Locator): Promise<string> {
  return (await locator.innerText()).trim();
}

export async function getValue(locator: Locator): Promise<string> {
  return locator.inputValue();
}

export async function getAttribute(locator: Locator, name: string): Promise<string | null> {
  return locator.getAttribute(name);
}

/**
 * State reads: "is it in this state?" - and they WAIT for it, which is what
 * makes page objects built on them work without a `wait` anywhere.
 *
 * Playwright's own `locator.isVisible()` / `isChecked()` / `count()` answer
 * instantly with whatever the page looks like at that exact moment, so
 * `if (await isVisible(x))` right after a click is a race against the app's
 * rendering. These versions wait up to the configured assertion timeout
 * (`EXPECT_TIMEOUT_MS`, default 10s) for the element to reach the state, and
 * return as soon as it does - a page that is already there costs nothing.
 *
 * The flip side: if the state never arrives they take the full timeout to
 * answer `false` / `0` / `[]`. For "should NOT be there" checks use
 * `assertions.toBeHidden` / `assertions.not.*` (they return the moment it's
 * gone), or pass `{ timeout: 0 }` for a true instant snapshot.
 */
export interface StateReadOptions {
  /** How long to wait for the state to arrive. Defaults to the configured assertion timeout; 0 = look once, don't wait. */
  timeout?: number;
}

async function reaches(assertion: (timeout: number | undefined) => Promise<void>, options?: StateReadOptions): Promise<boolean> {
  try {
    // timeout 0 would mean "no timeout" to Playwright's expect, so a snapshot is a 1ms look instead.
    await assertion(options?.timeout === 0 ? 1 : options?.timeout);
    return true;
  } catch {
    return false;
  }
}

export async function isVisible(locator: Locator, options?: StateReadOptions): Promise<boolean> {
  return reaches((timeout) => expect(locator).toBeVisible({ timeout }), options);
}

export async function isEnabled(locator: Locator, options?: StateReadOptions): Promise<boolean> {
  return reaches((timeout) => expect(locator).toBeEnabled({ timeout }), options);
}

export async function isChecked(locator: Locator, options?: StateReadOptions): Promise<boolean> {
  return reaches((timeout) => expect(locator).toBeChecked({ timeout }), options);
}

/** Number of matching elements - waits for at least one to appear; returns 0 if none does within the timeout. */
export async function count(locator: Locator, options?: StateReadOptions): Promise<number> {
  await reaches((timeout) => expect(locator.first()).toBeAttached({ timeout }), options);
  return locator.count();
}

/** Text of every matching element - waits for at least one to appear; returns [] if none does within the timeout. */
export async function allText(locator: Locator, options?: StateReadOptions): Promise<string[]> {
  await reaches((timeout) => expect(locator.first()).toBeAttached({ timeout }), options);
  return locator.allInnerTexts();
}

// ---- explicit waits (Playwright auto-waits on actions above already; these
// are for conditions no single action covers) ----

export async function waitForVisible(locator: Locator, timeoutMs?: number): Promise<void> {
  await locator.waitFor({ state: 'visible', timeout: timeoutMs });
}

export async function waitForHidden(locator: Locator, timeoutMs?: number): Promise<void> {
  await locator.waitFor({ state: 'hidden', timeout: timeoutMs });
}

export async function screenshotElement(locator: Locator, name: string): Promise<Buffer> {
  logger.info(`Screenshot (element): ${name}`);
  return locator.screenshot({ path: `screenshots/${name}.png` });
}
