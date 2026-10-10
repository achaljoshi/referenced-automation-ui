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
});
