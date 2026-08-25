import type { Page } from '@playwright/test';
import { BasePage } from '../../src/base/BasePage';

/**
 * Sample page object exercising BasePage end-to-end against the local
 * fixture.html - proves the framework works and doubles as a copy-able
 * example for consuming teams. Not shipped in the published package (see
 * package.json "files": ["dist"]).
 */
export class DemoPage extends BasePage {
  private readonly usernameInput = this.page.locator('#username');
  private readonly passwordInput = this.page.locator('#password');
  private readonly loginButton = this.page.locator('#login-button');
  private readonly loginError = this.page.locator('#login-error');
  private readonly dashboardHeading = this.page.locator('#dashboard-section h1');

  private readonly countrySelect = this.page.locator('#country');
  private readonly subscribeCheckbox = this.page.locator('#subscribe');
  private readonly dragSource = this.page.locator('#drag-source');
  private readonly dropTarget = this.page.locator('#drop-target');
  private readonly dropResult = this.page.locator('#drop-result');
  private readonly loadItemsButton = this.page.locator('#load-items');
  private readonly slowListItems = this.page.locator('.slow-item');
  private readonly openTabLink = this.page.locator('#open-tab-link');
  private readonly downloadLink = this.page.locator('#download-link');
  private readonly fileInput = this.page.locator('#file-input');
  private readonly fileNameLabel = this.page.locator('#file-name');

  constructor(page: Page) {
    super(page);
  }

  async openFixture(fixtureUrl: string): Promise<void> {
    await this.goto(fixtureUrl);
  }

  async loginAs(username: string, password: string): Promise<void> {
    await this.fill(this.usernameInput, username);
    await this.fill(this.passwordInput, password);
    await this.click(this.loginButton);
  }

  async isDashboardLoaded(): Promise<boolean> {
    return this.isVisible(this.dashboardHeading);
  }

  async isLoginErrorShown(): Promise<boolean> {
    return this.isVisible(this.loginError);
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

  async uploadFileAndGetName(filePath: string): Promise<string> {
    await this.uploadFile(this.fileInput, filePath);
    return this.getText(this.fileNameLabel);
  }
}
