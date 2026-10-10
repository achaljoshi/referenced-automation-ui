import type { Dialog, Page } from '@playwright/test';
import { logger } from '@automation/referenced-automation-utils';
import { step } from '../base/step';

/**
 * Browser dialogs (alert, confirm, prompt, beforeunload). Playwright dismisses them on its own when nothing listens,
 * which silently answers "Cancel" to every confirm; these make the answer explicit, record what was asked, and never
 * leave a dialog unhandled (an unhandled one freezes the page and stalls the action that opened it).
 */

export interface DialogRecord {
  type: 'alert' | 'confirm' | 'prompt' | 'beforeunload';
  message: string;
  /** The text a prompt started with. */
  defaultValue: string;
  /** What was done with it. */
  handledAs: 'accepted' | 'dismissed';
}

export type DialogAnswer = 'accept' | 'dismiss' | { accept: string };

async function answer(dialog: Dialog, how: DialogAnswer): Promise<DialogRecord> {
  const record: DialogRecord = {
    type: dialog.type() as DialogRecord['type'],
    message: dialog.message(),
    defaultValue: dialog.defaultValue(),
    handledAs: how === 'dismiss' ? 'dismissed' : 'accepted',
  };
  logger.info(`Dialog (${record.type}) "${record.message}" -> ${record.handledAs}${typeof how === 'object' ? ` with "${how.accept}"` : ''}`);
  try {
    if (how === 'dismiss') await dialog.dismiss();
    else if (how === 'accept') await dialog.accept();
    else await dialog.accept(how.accept);
  } catch (error) {
    // Another listener (a `recordDialogs` recorder, say) answered this dialog first: the first answer stands.
    if (!/already handled/i.test(String(error))) throw error;
    logger.warn(`Dialog (${record.type}) "${record.message}" was already answered by another handler; its answer stands`);
  }
  return record;
}

/**
 * Runs `action` (the click that makes the dialog appear) and answers the dialog it raises. Returns what was asked, so
 * the test can assert on the message. Fails if the action raised no dialog - a dialog you expected is part of the test.
 * Only this call's own listener is removed afterwards, so it can run while `recordDialogs` is active (whichever
 * listener answers first decides the answer).
 *
 *   const dialog = await dialogs.handleDialogDuring(page, () => actions.click(deleteButton), 'accept');
 *   expect(dialog.message).toBe('Delete this order?');
 */
export async function handleDialogDuring(
  page: Page,
  action: () => Promise<void>,
  how: DialogAnswer = 'accept',
  options: { timeoutMs?: number } = {},
): Promise<DialogRecord> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  return step(`Handle dialog (${typeof how === 'object' ? 'accept with text' : how}) during action`, async () => {
    // Only THIS call's own listener and timer are removed afterwards: other listeners (recordDialogs, a test's own) stay.
    let listener: ((dialog: Dialog) => void) | undefined;
    let timer: NodeJS.Timeout | undefined;
    const handled = new Promise<DialogRecord>((resolve, reject) => {
      listener = (dialog) => {
        page.off('dialog', listener as (dialog: Dialog) => void); // answers the first dialog only
        void answer(dialog, how).then(resolve, reject);
      };
      page.on('dialog', listener);
    });
    const timedOut = new Promise<{ record?: undefined }>((resolve) => {
      timer = setTimeout(() => resolve({}), timeoutMs);
    });
    // The action itself can block until the dialog is answered, so run both and surface a missing dialog afterwards.
    const both = Promise.all([action(), handled]).then(([, record]) => ({ record }));
    // If the timeout (or a failed action) wins the race, `both` is still pending: its late rejection must not become an unhandled one.
    both.catch(() => undefined);
    try {
      const result = await Promise.race([both, timedOut]);
      if (!result.record) throw new Error(`The action raised no dialog within ${timeoutMs} ms`);
      return result.record;
    } finally {
      clearTimeout(timer);
      if (listener) page.off('dialog', listener);
    }
  });
}

export interface DialogRecorder {
  /** Every dialog seen so far, in order. */
  readonly dialogs: readonly DialogRecord[];
  /** Messages only. */
  messages(): string[];
  /** Throws unless exactly these messages (in order) were seen. */
  expectMessages(expected: Array<string | RegExp>): void;
  /** Stops answering dialogs (Playwright's default - dismiss - applies again). */
  stop(): void;
}

/**
 * Answers EVERY dialog on the page from now on (default: accept) and records them - for flows where several dialogs
 * may appear and what matters is that they were handled and what they said.
 */
export function recordDialogs(page: Page, how: DialogAnswer = 'accept'): DialogRecorder {
  const dialogs: DialogRecord[] = [];
  const listener = (dialog: Dialog) => {
    answer(dialog, how).then((record) => dialogs.push(record), (error) => logger.error(`Dialog handling failed: ${String(error)}`));
  };
  page.on('dialog', listener);
  return {
    dialogs,
    messages: () => dialogs.map((d) => d.message),
    expectMessages(expected) {
      const actual = dialogs.map((d) => d.message);
      const ok = actual.length === expected.length && expected.every((e, i) => (typeof e === 'string' ? actual[i] === e : e.test(actual[i] as string)));
      if (!ok) throw new Error(`Expected dialogs ${JSON.stringify(expected.map(String))} but saw ${JSON.stringify(actual)}`);
    },
    stop: () => void page.off('dialog', listener),
  };
}

/** Leaves the page asking "are you sure you want to leave?" (beforeunload) instead of answering it: closes the page running its unload handlers. */
export async function closeRunningUnloadHandlers(page: Page): Promise<void> {
  await step('Close page, running beforeunload handlers', () => page.close({ runBeforeUnload: true }));
}
