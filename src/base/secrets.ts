/// <reference lib="dom" />
import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Typed values that must not end up in step titles, logs or reports: passwords, tokens, one-time codes.
 *
 * Two things print what an action typed: this package's own step title (and the log line that repeats it), and
 * Playwright's own `Fill "<value>"` / `Type "<value>"` call step, which every reporter (HTML, Allure, JUnit) shows. A
 * secret therefore gets a `***` title here AND is entered through the page (`locator.evaluate`, whose step carries no
 * value) instead of `locator.fill` / `locator.pressSequentially`. Playwright's trace still records call parameters, so
 * treat a trace of a login as sensitive.
 */

/** What replaces a secret wherever the action is described. */
export const MASK = '***';

/** Options of the actions that type a value. */
export interface SecretOption {
  /**
   * `true`: the value is secret (shown as `***`). `false`: do not guess from the field's name or label (a password
   * input is still masked). Omitted: masked when the field is `<input type=password>`, has an autocomplete of
   * `current-password` / `new-password` / `one-time-code`, or its name, label, placeholder, id or test id looks like
   * password / passwd / passcode / pin / otp / secret / token / api key.
   */
  secret?: boolean;
}

const SECRET_NAME = /pass(word|wd|code|phrase)|secret|token|api[\s_-]?key|(^|[^a-z])(pin|otp)([^a-z]|$)/i;

/** True when a field's name, label or test id says it holds a secret. */
export function looksSecret(text: string): boolean {
  return SECRET_NAME.test(text);
}

/** How long to wait for the field when asking what it is: a field that is not there yet is treated as secret (the safe answer). */
const PROBE_TIMEOUT_MS = 1_000;

interface FieldFacts {
  type: string;
  autocomplete: string;
  hints: string;
}

function readFacts(element: Element): FieldFacts {
  const input = element as HTMLInputElement;
  const labelledBy = (element.getAttribute('aria-labelledby') ?? '')
    .split(/\s+/)
    .map((id) => (id ? document.getElementById(id)?.textContent ?? '' : ''));
  const labels = Array.from(input.labels ?? []).map((label) => label.textContent ?? '');
  const testIds = Array.from(element.attributes)
    .filter((attribute) => /^data-test/i.test(attribute.name))
    .map((attribute) => attribute.value);
  return {
    type: (input.type ?? '').toLowerCase(),
    autocomplete: (element.getAttribute('autocomplete') ?? '').toLowerCase(),
    hints: [element.id, element.getAttribute('name'), element.getAttribute('aria-label'), element.getAttribute('placeholder'), element.getAttribute('title'), ...labels, ...labelledBy, ...testIds].join(' '),
  };
}

function isSecretField(facts: FieldFacts, extraHints: string, option: boolean | undefined): boolean {
  if (facts.type === 'password' || /current-password|new-password|one-time-code/.test(facts.autocomplete)) return true;
  if (option === false) return false;
  return looksSecret(`${facts.hints} ${extraHints}`);
}

/**
 * Whether typing into `locator` types a secret. Fails safe: when the field cannot be inspected (not there within a
 * second, several matches, page closed) the answer is yes.
 */
export async function isSecretTarget(locator: Locator, option?: boolean): Promise<boolean> {
  if (option === true) return true;
  try {
    return isSecretField(await locator.evaluate(readFacts, undefined, { timeout: PROBE_TIMEOUT_MS }), locator.toString(), option);
  } catch {
    return true;
  }
}

/** The same for "whatever has focus" - what keyboard typing at page level goes into. Nothing focused is not a secret field. */
export async function isSecretFocus(page: Page, option?: boolean): Promise<boolean> {
  if (option === true) return true;
  try {
    const focused = (await page.evaluateHandle(() => (document.activeElement && document.activeElement !== document.body ? document.activeElement : null))).asElement();
    return focused ? isSecretField(await focused.evaluate(readFacts), '', option) : false;
  } catch {
    return true;
  }
}

/** Replaces every occurrence of each secret in the error's message and stack (a failed action's call log repeats what was typed). */
export function redactError(error: unknown, secrets: readonly string[] | undefined): void {
  if (!(error instanceof Error) || !secrets) return;
  for (const secret of secrets) {
    if (!secret) continue;
    error.message = error.message.split(secret).join(MASK);
    if (error.stack) error.stack = error.stack.split(secret).join(MASK);
  }
}

/** The title of a typing action: the value, or `***` when it is secret. */
export const shown = (value: string, secret: boolean): string => (secret ? MASK : value);

type TextEntry = (element: Element, value: string) => void;

/** Runs in the page: sets the value the way a user's input does - focus, replace, native setter (so React-style trackers notice), input event. */
const enterValue: TextEntry = (element, value) => {
  const html = element as HTMLElement;
  html.focus();
  if (html.isContentEditable) {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(html);
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.execCommand('insertText', false, value);
    return;
  }
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
    throw new Error('Element is not an <input>, <textarea> or [contenteditable] element');
  }
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set;
  element.select();
  if (setter) setter.call(element, value);
  else element.value = value;
  element.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: value }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
};

/** Runs in the page: appends the value one character at a time with key and input events (synthetic - `isTrusted` is false). */
const enterKeys: TextEntry = (element, value) => {
  const html = element as HTMLElement;
  html.focus();
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
    for (const character of value) document.execCommand('insertText', false, character);
    return;
  }
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set;
  for (const character of value) {
    element.dispatchEvent(new KeyboardEvent('keydown', { key: character, bubbles: true, composed: true }));
    const next = element.value + character;
    if (setter) setter.call(element, next);
    else element.value = next;
    element.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: character }));
    element.dispatchEvent(new KeyboardEvent('keyup', { key: character, bubbles: true, composed: true }));
  }
  element.dispatchEvent(new Event('change', { bubbles: true }));
};

/**
 * `fill` / `pressSequentially` for a value that must not be printed. Playwright's own steps for those calls repeat the
 * value, so it is passed to the page as an argument of `evaluate` (whose step does not show it) after the same checks
 * `fill` makes: the field is visible, enabled and editable.
 */
export async function enterSecret(locator: Locator, value: string, how: 'fill' | 'type'): Promise<void> {
  await locator.waitFor({ state: 'visible' });
  await expect(locator).toBeEditable();
  await locator.evaluate(how === 'fill' ? enterValue : enterKeys, value);
}

/** Typing at page level (whatever has focus) for a secret value: same idea, into `document.activeElement`. */
export async function enterSecretOnPage(page: Page, value: string): Promise<void> {
  const focused = (await page.evaluateHandle(() => (document.activeElement && document.activeElement !== document.body ? document.activeElement : null))).asElement();
  if (!focused) throw new Error('Nothing has focus to type into');
  await focused.evaluate(enterKeys, value);
}
