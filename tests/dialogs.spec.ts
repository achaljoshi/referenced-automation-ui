import type { Page } from '@playwright/test';
import { test, expect } from '../src/fixtures/uiFixtures';
import * as actions from '../src/actions';
import * as assertions from '../src/assertions';
import * as dialogs from '../src/dialogs/dialogs';
import { servePage } from './support/servePage';

const PAGE = `
<button id="alert" onclick="alert('Saved!'); document.getElementById('out').textContent='after alert'">Alert</button>
<button id="confirm" onclick="document.getElementById('out').textContent = confirm('Delete this order?') ? 'deleted' : 'kept'">Confirm</button>
<button id="prompt" onclick="document.getElementById('out').textContent = 'hello ' + prompt('Your name?', 'anon')">Prompt</button>
<button id="none" onclick="document.getElementById('out').textContent='no dialog'">Nothing</button>
<button id="two" onclick="alert('one'); alert('two'); document.getElementById('out').textContent='both'">Two</button>
<span id="out"></span>
`;

/** Playwright's pages are event emitters; the typings do not list `listenerCount`. */
const dialogListeners = (page: Page) => (page as unknown as { listenerCount(event: string): number }).listenerCount('dialog');

test.describe('dialogs', () => {
  test.beforeEach(async ({ page }) => servePage(page, PAGE));

  test('handleDialogDuring accepts a confirm and tells you what it asked', async ({ page }) => {
    const dialog = await dialogs.handleDialogDuring(page, () => actions.click(page.locator('#confirm')), 'accept');
    expect(dialog).toMatchObject({ type: 'confirm', message: 'Delete this order?', handledAs: 'accepted' });
    await assertions.toHaveText(page.locator('#out'), 'deleted');
  });

  test('...or dismisses it - Cancel is a real answer, not what happens by accident', async ({ page }) => {
    const dialog = await dialogs.handleDialogDuring(page, () => actions.click(page.locator('#confirm')), 'dismiss');
    expect(dialog.handledAs).toBe('dismissed');
    await assertions.toHaveText(page.locator('#out'), 'kept');
  });

  test('a prompt is answered with text and shows its default', async ({ page }) => {
    const dialog = await dialogs.handleDialogDuring(page, () => actions.click(page.locator('#prompt')), { accept: 'Ada' });
    expect(dialog).toMatchObject({ type: 'prompt', message: 'Your name?', defaultValue: 'anon' });
    await assertions.toHaveText(page.locator('#out'), 'hello Ada');
  });

  test('an alert is accepted by default', async ({ page }) => {
    const dialog = await dialogs.handleDialogDuring(page, () => actions.click(page.locator('#alert')));
    expect(dialog).toMatchObject({ type: 'alert', message: 'Saved!' });
    await assertions.toHaveText(page.locator('#out'), 'after alert');
  });

  test('recordDialogs answers every dialog and records them in order', async ({ page }) => {
    const recorder = dialogs.recordDialogs(page, 'accept');
    await actions.click(page.locator('#two'));
    await assertions.toHaveText(page.locator('#out'), 'both');
    expect(recorder.messages()).toEqual(['one', 'two']);
    recorder.expectMessages(['one', /^tw/]);
    expect(() => recorder.expectMessages(['one'])).toThrow(/Expected dialogs \["one"\] but saw \["one","two"\]/);
    recorder.stop();
  });

  test('a dialog that was expected but never raised fails with a clear message', async ({ page }) => {
    await expect(dialogs.handleDialogDuring(page, () => actions.click(page.locator('#none')), 'accept', { timeoutMs: 500 })).rejects.toThrow(/raised no dialog within 500 ms/);
  });

  // UI-02: handleDialogDuring cleans up after itself - and only after itself.
  test('a handleDialogDuring that times out leaves other dialog listeners alone: recordDialogs keeps recording', async ({ page }) => {
    const recorder = dialogs.recordDialogs(page, 'accept');
    await expect(dialogs.handleDialogDuring(page, () => actions.click(page.locator('#none')), 'accept', { timeoutMs: 300 })).rejects.toThrow(/no dialog/);
    expect(dialogListeners(page)).toBe(1); // the recorder's, not ours
    await actions.click(page.locator('#alert'));
    await assertions.toHaveText(page.locator('#out'), 'after alert');
    expect(recorder.messages()).toEqual(['Saved!']);
    recorder.stop();
  });

  test('handleDialogDuring and recordDialogs can be active together: the first answer stands, nothing fails', async ({ page }) => {
    const recorder = dialogs.recordDialogs(page, 'dismiss');
    const dialog = await dialogs.handleDialogDuring(page, () => actions.click(page.locator('#confirm')), 'accept');
    expect(dialog.message).toBe('Delete this order?');
    expect(recorder.messages()).toEqual(['Delete this order?']);
    await assertions.toHaveText(page.locator('#out'), 'kept'); // the recorder was registered first and dismissed it
    expect(dialogListeners(page)).toBe(1);
    recorder.stop();
  });

  test('a failed action removes its own listener, so it does not answer a later dialog', async ({ page }) => {
    await expect(dialogs.handleDialogDuring(page, () => Promise.reject(new Error('click failed')), 'accept')).rejects.toThrow('click failed');
    expect(dialogListeners(page)).toBe(0);
  });

  test('an action that fails after the dialog wait gave up does not become an unhandled rejection', async ({ page }) => {
    const unhandled: unknown[] = [];
    const record = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', record);
    try {
      const late = () => new Promise<void>((_, reject) => setTimeout(() => reject(new Error('late failure')), 300));
      await expect(dialogs.handleDialogDuring(page, late, 'accept', { timeoutMs: 50 })).rejects.toThrow(/no dialog/);
      await new Promise((resolve) => setTimeout(resolve, 600)); // let the late rejection happen
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', record);
    }
  });
});
