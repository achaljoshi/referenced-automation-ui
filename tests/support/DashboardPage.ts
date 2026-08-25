import type { Page } from '@playwright/test';
import { BasePage } from '../../src/base/BasePage';
import { FileUploadWidget } from './components/FileUploadWidget';

/**
 * Sample page object for the dashboard screen only - see LoginPage's
 * javadoc-style comment for why this used to be one combined class and
 * isn't anymore. Not shipped in the published package.
 */
export class DashboardPage extends BasePage {
  private readonly heading = this.page.locator('#dashboard-section h1');
  private readonly countrySelect = this.page.locator('#country');
  private readonly subscribeCheckbox = this.page.locator('#subscribe');
  private readonly dragSource = this.page.locator('#drag-source');
  private readonly dropTarget = this.page.locator('#drop-target');
  private readonly dropResult = this.page.locator('#drop-result');
  private readonly loadItemsButton = this.page.locator('#load-items');
  private readonly slowListItems = this.page.locator('.slow-item');
  private readonly openTabLink = this.page.locator('#open-tab-link');
  private readonly downloadLink = this.page.locator('#download-link');

  /** A composed component, not a flat set of locators - see FileUploadWidget. */
  readonly fileUpload: FileUploadWidget;

  constructor(page: Page) {
    super(page);
    this.fileUpload = new FileUploadWidget(page, page.locator('#dashboard-section'));
  }

  async isLoaded(): Promise<boolean> {
    return this.isVisible(this.heading);
  }

  async selectCountry(value: string): Promise<void> {
    await this.selectOption(this.countrySelect, value);
  }

  async subscribe(): Promise<void> {
    await this.check(this.subscribeCheckbox);
  }

  async isSubscribed(): Promise<boolean> {
    return this.isChecked(this.subscribeCheckbox);
  }

  async dragCardToTarget(): Promise<void> {
    await this.dragAndDrop(this.dragSource, this.dropTarget);
  }

  async dropResultText(): Promise<string> {
    return this.getText(this.dropResult);
  }

  async loadSlowItems(): Promise<void> {
    await this.click(this.loadItemsButton);
    await this.waitForVisible(this.slowListItems.first());
  }

  async slowItemTexts(): Promise<string[]> {
    return this.allText(this.slowListItems);
  }

  async clickInsideFrame(): Promise<string> {
    const frame = this.frame('#content-frame');
    await frame.locator('#inner-button').click();
    return frame.locator('#inner-result').innerText();
  }

  async openNewTab(): Promise<Page> {
    return this.waitForNewTab(() => this.click(this.openTabLink));
  }

  async downloadReport(savePath: string): Promise<string> {
    const download = await this.downloadFile(() => this.click(this.downloadLink), savePath);
    return download.suggestedFilename();
  }
}
