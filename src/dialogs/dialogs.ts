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
  if (how === 'dismiss') await dialog.dismiss();
  else if (how === 'accept') await dialog.accept();
  else await dialog.accept(how.accept);
  return record;
}

/**
 * Runs `action` (the click that makes the dialog appear) and answers the dialog it raises. Returns what was asked, so
 * the test can assert on the message. Fails if the action raised no dialog - a dialog you expected is part of the test.
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
    const handled = new Promise<DialogRecord>((resolve, reject) => {
      page.once('dialog', (dialog) => answer(dialog, how).then(resolve, reject));
    });
    // The action itself can block until the dialog is answered, so run both and surface a missing dialog afterwards.
    const result = await Promise.race([
      Promise.all([action(), handled]).then(([, record]) => ({ record })),
      new Promise<{ record?: undefined }>((resolve) => setTimeout(() => resolve({}), timeoutMs)),
    ]);
    if (!result.record) {
      page.removeAllListeners('dialog');
      throw new Error(`The action raised no dialog within ${timeoutMs} ms`);
    }
    return result.record;
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
