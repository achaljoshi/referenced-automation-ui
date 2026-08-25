import * as os from 'node:os';
import * as path from 'node:path';
import { test, expect } from '../src/fixtures/uiFixtures';
import { DemoPage } from './support/DemoPage';

const fixtureUrl = `file://${path.join(__dirname, 'support', 'fixture.html')}`;

test.describe('BasePage - login flow', () => {
  test('logs in with valid credentials @smoke', async ({ page }) => {
    const demo = new DemoPage(page);
    await demo.openFixture(fixtureUrl);
    await demo.loginAs('ada', 'secret');
    expect(await demo.isDashboardLoaded()).toBe(true);
  });

  test('shows an error for invalid credentials @regression', async ({ page }) => {
    const demo = new DemoPage(page);
    await demo.openFixture(fixtureUrl);
    await demo.loginAs('ada', 'wrong-password');
    expect(await demo.isLoginErrorShown()).toBe(true);
  });
});

test.describe('BasePage - form controls @regression', () => {
  test.beforeEach(async ({ page }) => {
    const demo = new DemoPage(page);
    await demo.openFixture(fixtureUrl);
    await demo.loginAs('ada', 'secret');
  });

  test('selects a dropdown option', async ({ page }) => {
    const demo = new DemoPage(page);
    await demo.selectCountry('uk');
    await expect(page.locator('#country')).toHaveValue('uk');
  });

  test('checks a checkbox', async ({ page }) => {
    const demo = new DemoPage(page);
    await demo.subscribe();
    expect(await demo.isSubscribed()).toBe(true);
  });

  test('drags and drops', async ({ page }) => {
    const demo = new DemoPage(page);
    await demo.dragCardToTarget();
    expect(await demo.dropResultText()).toBe('dropped');
  });

  test('waits for asynchronously rendered items', async ({ page }) => {
    const demo = new DemoPage(page);
    await demo.loadSlowItems();
    expect(await demo.slowItemTexts()).toEqual(['Item 1', 'Item 2', 'Item 3']);
  });

  test('interacts with content inside an iframe', async ({ page }) => {
    const demo = new DemoPage(page);
    expect(await demo.clickInsideFrame()).toBe('clicked inside frame');
  });

  test('opens a new tab', async ({ page }) => {
    const demo = new DemoPage(page);
    const popup = await demo.openNewTab();
    expect(popup.url()).toContain('about:blank');
    await popup.close();
  });

  test('downloads a file', async ({ page }) => {
    const demo = new DemoPage(page);
    const savePath = path.join(os.tmpdir(), `ui-download-test-${Date.now()}.txt`);
    const suggestedName = await demo.downloadReport(savePath);
    expect(suggestedName).toBe('report.txt');
  });

  test('uploads a file', async ({ page }) => {
    const demo = new DemoPage(page);
    const filePath = path.join(__dirname, 'support', 'upload-fixture.txt');
    const shownName = await demo.uploadFileAndGetName(filePath);
    expect(shownName).toBe('upload-fixture.txt');
  });
});
