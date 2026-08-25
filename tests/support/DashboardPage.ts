import type { Page } from '@playwright/test';
import { actions } from '../../src';
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
  const heading = page.locator('#dashboard-section h1');
  const countrySelect = page.locator('#country');
  const subscribeCheckbox = page.locator('#subscribe');
  const dragSource = page.locator('#drag-source');
  const dropTarget = page.locator('#drop-target');
  const dropResult = page.locator('#drop-result');
  const loadItemsButton = page.locator('#load-items');
  const slowListItems = page.locator('.slow-item');
  const openTabLink = page.locator('#open-tab-link');
  const downloadLink = page.locator('#download-link');

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
      const contentFrame = actions.frame(page, '#content-frame');
      await contentFrame.locator('#inner-button').click();
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
