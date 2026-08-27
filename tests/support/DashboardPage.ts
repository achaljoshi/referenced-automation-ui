import type { Page } from '@playwright/test';
import { actions, locators } from '../../src';
import { createFileUploadWidget, type FileUploadWidget } from './components/FileUploadWidget';

/**
 * Sample page object for the dashboard screen only - see LoginPage's
 * javadoc-style comment for why this used to be one combined class and
 * isn't anymore, and for the composition-over-inheritance rationale. Not
 * shipped in the published package.
 */
export interface DashboardPage {
  isLoaded(): Promise<boolean>;
  selectCountry(value: string): Promise<void>;
  subscribe(): Promise<void>;
  isSubscribed(): Promise<boolean>;
  dragCardToTarget(): Promise<void>;
  dropResultText(): Promise<string>;
  loadSlowItems(): Promise<void>;
  slowItemTexts(): Promise<string[]>;
  clickInsideFrame(): Promise<string>;
  openNewTab(): Promise<Page>;
  downloadReport(savePath: string): Promise<string>;
  /** A composed component, not a flat set of locators - see FileUploadWidget. */
  fileUpload: FileUploadWidget;
}

export function createDashboardPage(page: Page): DashboardPage {
  const heading = locators.role.heading(page, 'Dashboard');
  const countrySelect = locators.role.combobox(page, 'Country');
  const subscribeCheckbox = locators.role.checkbox(page, 'Subscribe');
  // drag-source/drop-target/drop-result are plain, non-interactive <div>/<p>
  // elements with no ARIA role or accessible name of their own - a raw CSS
  // locator is the right tool here, not a forced getByRole/getByText.
  const dragSource = page.locator('#drag-source');
  const dropTarget = page.locator('#drop-target');
  const dropResult = page.locator('#drop-result');
  const loadItemsButton = locators.role.button(page, 'Load items');
  // <li> inside <ul> gets the implicit ARIA role "listitem" for free.
  const slowListItems = locators.role.listitem(page);
  const openTabLink = locators.role.link(page, 'Open new tab');
  const downloadLink = locators.role.link(page, 'Download report');

  return {
    fileUpload: createFileUploadWidget(page, page.locator('#dashboard-section')),

    async isLoaded() {
      return actions.isVisible(heading);
    },

    async selectCountry(value) {
      await actions.selectOption(countrySelect, value);
    },

    async subscribe() {
      await actions.check(subscribeCheckbox);
    },

    async isSubscribed() {
      return actions.isChecked(subscribeCheckbox);
    },

    async dragCardToTarget() {
      await actions.dragAndDrop(dragSource, dropTarget);
    },

    async dropResultText() {
      return actions.getText(dropResult);
    },

    async loadSlowItems() {
      await actions.click(loadItemsButton);
      await actions.waitForVisible(slowListItems.first());
    },

    async slowItemTexts() {
      return actions.allText(slowListItems);
    },

    async clickInsideFrame() {
      // Role locators scope into a FrameLocator exactly like they scope
      // into a Locator - locators.role.* isn't page-only.
      const contentFrame = actions.frame(page, '#content-frame');
      await locators.role.button(contentFrame, 'Click inside frame').click();
      return contentFrame.locator('#inner-result').innerText();
    },

    async openNewTab() {
      return actions.waitForNewTab(page, () => actions.click(openTabLink));
    },

    async downloadReport(savePath) {
      const download = await actions.downloadFile(page, () => actions.click(downloadLink), savePath);
      return download.suggestedFilename();
    },
  };
}
