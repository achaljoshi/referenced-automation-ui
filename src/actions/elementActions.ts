import type { Locator } from '@playwright/test';
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

export async function isVisible(locator: Locator): Promise<boolean> {
  return locator.isVisible();
}

export async function isEnabled(locator: Locator): Promise<boolean> {
  return locator.isEnabled();
}

export async function isChecked(locator: Locator): Promise<boolean> {
  return locator.isChecked();
}

export async function count(locator: Locator): Promise<number> {
  return locator.count();
}

export async function allText(locator: Locator): Promise<string[]> {
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
