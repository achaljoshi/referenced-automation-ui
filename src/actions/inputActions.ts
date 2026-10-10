/// <reference lib="dom" />
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { step } from '../base/step';

/**
 * The input side of Playwright's actions guide that elementActions.ts does not already cover: checkbox state,
 * text selection, DOM events, touch, keyboard and mouse at page level, scrolling, files from memory, whole forms.
 * Same shape as the rest: every function takes what it acts on explicitly, is logged as a step, and waits through
 * Playwright's own actionability checks - nothing here sleeps.
 */

const describe = (locator: Locator) => locator.toString();

export async function setChecked(locator: Locator, checked: boolean): Promise<void> {
  await step(`Set checked=${checked} -> ${describe(locator)}`, () => locator.setChecked(checked));
}

/** Selects the text in an input / the element's contents (to copy, or to type over it). */
export async function selectText(locator: Locator): Promise<void> {
  await step(`Select text -> ${describe(locator)}`, () => locator.selectText());
}

export async function scrollIntoView(locator: Locator): Promise<void> {
  await step(`Scroll into view -> ${describe(locator)}`, () => locator.scrollIntoViewIfNeeded());
}

/** Fires a DOM event directly ('click', 'dragstart', a custom one) - for elements that cannot be reached by a real action. */
export async function dispatchEvent(locator: Locator, type: string, eventInit?: Record<string, unknown>): Promise<void> {
  await step(`Dispatch "${type}" -> ${describe(locator)}`, () => locator.dispatchEvent(type, eventInit));
}

export async function blur(locator: Locator): Promise<void> {
  await step(`Blur -> ${describe(locator)}`, () => locator.blur());
}

/** A touch tap (needs `hasTouch`, e.g. one of the mobile device projects). */
export async function tap(locator: Locator): Promise<void> {
  await step(`Tap -> ${describe(locator)}`, () => locator.tap());
}

/** Clicks with modifier keys held: `clickWithModifiers(link, ['ControlOrMeta'])` opens in a new tab on every OS. */
export async function clickWithModifiers(locator: Locator, modifiers: Array<'Alt' | 'Control' | 'ControlOrMeta' | 'Meta' | 'Shift'>): Promise<void> {
  await step(`Click with ${modifiers.join('+')} -> ${describe(locator)}`, () => locator.click({ modifiers }));
}

/** Clicks at a point inside the element (canvas, map, slider track), in pixels from its top-left corner. */
export async function clickAt(locator: Locator, position: { x: number; y: number }): Promise<void> {
  await step(`Click at ${position.x},${position.y} -> ${describe(locator)}`, () => locator.click({ position }));
}

/** Checks that a click WOULD succeed (visible, stable, enabled, receives events) without clicking. */
export async function canClick(locator: Locator): Promise<boolean> {
  try {
    await locator.click({ trial: true, timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

export async function clearFiles(locator: Locator): Promise<void> {
  await step(`Clear selected files -> ${describe(locator)}`, () => locator.setInputFiles([]));
}

/** Uploads a file that exists only in memory - no fixture file on disk needed. */
export async function uploadFromMemory(locator: Locator, file: { name: string; mimeType: string; content: string | Buffer }): Promise<void> {
  await step(`Upload "${file.name}" (${file.mimeType}) from memory -> ${describe(locator)}`, () =>
    locator.setInputFiles({ name: file.name, mimeType: file.mimeType, buffer: Buffer.from(file.content) }),
  );
}

/** For uploads whose <input type=file> is created on demand: runs `action` (the click that opens the chooser) and answers it with `files`. */
export async function chooseFiles(page: Page, action: () => Promise<void>, files: string | string[]): Promise<void> {
  await step('Choose file(s) in the file chooser', async () => {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), action()]);
    await chooser.setFiles(files);
  });
}

// ---- page-level keyboard and mouse ----

/** Presses a key or shortcut on whatever has focus: 'Escape', 'Control+A', 'Shift+Tab'. */
export async function pressOnPage(page: Page, key: string): Promise<void> {
  await step(`Press "${key}" on the page`, () => page.keyboard.press(key));
}

/** Types into whatever has focus, key by key. */
export async function typeOnPage(page: Page, text: string, delayMs?: number): Promise<void> {
  await step(`Type "${text}" on the page`, () => page.keyboard.type(text, { delay: delayMs }));
}

export async function moveMouse(page: Page, x: number, y: number): Promise<void> {
  await step(`Move mouse to ${x},${y}`, () => page.mouse.move(x, y));
}

/** Moves the pointer away from everything - ends a hover so it does not show in a screenshot. */
export async function moveMouseAway(page: Page): Promise<void> {
  await page.mouse.move(-1, -1);
}

/** Drags in steps with the mouse (sliders, resizable panes, canvases) - `dragAndDrop` is for elements that support HTML5 drag. */
export async function dragBy(locator: Locator, dx: number, dy: number): Promise<void> {
  await step(`Drag by ${dx},${dy} -> ${describe(locator)}`, async () => {
    const box = await locator.boundingBox();
    if (!box) throw new Error(`Cannot drag: ${describe(locator)} has no box on the page`);
    const page = locator.page();
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + dx, startY + dy, { steps: 10 });
    await page.mouse.up();
  });
}

export async function scrollWheel(page: Page, deltaX: number, deltaY: number): Promise<void> {
  await step(`Scroll wheel ${deltaX},${deltaY}`, () => page.mouse.wheel(deltaX, deltaY));
}

/** Scrolls the page itself (not an element) to the top or bottom. */
export async function scrollPageTo(page: Page, where: 'top' | 'bottom'): Promise<void> {
  await step(`Scroll page to ${where}`, () => page.evaluate((target) => window.scrollTo(0, target === 'top' ? 0 : document.documentElement.scrollHeight), where));
}

// ---- forms ----

export type FormValue = string | number | boolean | string[];

/**
 * Fills a form by its visible labels: `fillForm(page, { 'First name': 'Ada', 'Country': 'UK', 'Subscribe': true })`.
 * Each control is found with getByLabel and handled by what it is - text input / textarea: fill; checkbox / radio:
 * set checked (a boolean); <select>: choose the option with that label (an array selects several). A label that
 * matches nothing fails with the label named, not a generic timeout.
 */
export async function fillForm(scope: Page | Locator, values: Record<string, FormValue>, options: { exact?: boolean } = {}): Promise<void> {
  await step(`Fill form (${Object.keys(values).join(', ')})`, async () => {
    for (const [label, value] of Object.entries(values)) {
      const exact = scope.getByLabel(label, { exact: true });
      const loose = scope.getByLabel(label, { exact: false });
      // Wait for the control to exist (either way of matching), then prefer the exact label: a label that WRAPS a
      // <select> carries the option texts in its name, so only the looser match finds it.
      await expect(exact.or(loose).first(), `form field "${label}"`).toBeAttached().catch(() => undefined);
      const control = options.exact === false || (await exact.count()) === 0 ? loose : exact;
      const count = await control.count();
      if (count !== 1) {
        throw new Error(count === 0 ? `fillForm: no control labelled "${label}"` : `fillForm: ${count} controls are labelled "${label}" - pass a Locator scoped to one of them`);
      }
      const tag = await control.evaluate((element) => element.tagName.toLowerCase());
      const type = await control.evaluate((element) => (element as HTMLInputElement).type ?? '');
      if (tag === 'select') await control.selectOption(Array.isArray(value) ? value.map((v) => ({ label: v })) : { label: String(value) });
      else if (type === 'checkbox' || type === 'radio') await control.setChecked(Boolean(value));
      else await control.fill(String(value));
    }
  });
}
