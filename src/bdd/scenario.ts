import type { Page } from '@playwright/test';
import type { DialogRecorder } from '../dialogs/dialogs';
import type { DownloadedFile } from '../actions/pageActions';
import type { PageGuard } from '../diagnostics/pageGuard';

/**
 * What one Gherkin scenario carries between steps: which page the steps act on (it changes when a step switches to a
 * new tab), the dialogs recorded, the last download, and the page guard. Remembered TEXT lives in `vars`.
 */
export class UiScenario {
  /** The page every step acts on. Starts as the test's `page`; "I switch to the new tab" changes it. */
  page: Page;
  readonly firstPage: Page;
  dialogs?: DialogRecorder;
  download?: DownloadedFile;
  guard?: PageGuard;

  constructor(page: Page) {
    this.page = page;
    this.firstPage = page;
  }
}
