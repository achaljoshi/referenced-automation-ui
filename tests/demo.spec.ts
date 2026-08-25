import * as os from 'node:os';
import * as path from 'node:path';
import { test, expect } from './support/fixtures';

test.describe('Login flow', () => {
  test('logs in with valid credentials @smoke', async ({ loginPage }) => {
    const dashboard = await loginPage.loginAs('ada', 'secret');
    expect(await dashboard.isLoaded()).toBe(true);
  });

  test('shows an error for invalid credentials @regression', async ({ loginPage }) => {
    await loginPage.attemptLogin('ada', 'wrong-password');
    expect(await loginPage.isErrorShown()).toBe(true);
  });
});

test.describe('Dashboard form controls @regression', () => {
  test('selects a dropdown option', async ({ dashboardPage, page }) => {
    await dashboardPage.selectCountry('uk');
    await expect(page.locator('#country')).toHaveValue('uk');
  });

  test('checks a checkbox', async ({ dashboardPage }) => {
    await dashboardPage.subscribe();
    expect(await dashboardPage.isSubscribed()).toBe(true);
  });

  test('drags and drops', async ({ dashboardPage }) => {
    await dashboardPage.dragCardToTarget();
    expect(await dashboardPage.dropResultText()).toBe('dropped');
  });

  test('waits for asynchronously rendered items', async ({ dashboardPage }) => {
    await dashboardPage.loadSlowItems();
    expect(await dashboardPage.slowItemTexts()).toEqual(['Item 1', 'Item 2', 'Item 3']);
  });

  test('interacts with content inside an iframe', async ({ dashboardPage }) => {
    expect(await dashboardPage.clickInsideFrame()).toBe('clicked inside frame');
  });

  test('opens a new tab', async ({ dashboardPage }) => {
    const popup = await dashboardPage.openNewTab();
    expect(popup.url()).toContain('about:blank');
    await popup.close();
  });

  test('downloads a file', async ({ dashboardPage }) => {
    const savePath = path.join(os.tmpdir(), `ui-download-test-${Date.now()}.txt`);
    const suggestedName = await dashboardPage.downloadReport(savePath);
    expect(suggestedName).toBe('report.txt');
  });

  test('uploads a file via the FileUploadWidget component', async ({ dashboardPage }) => {
    const filePath = path.join(__dirname, 'support', 'upload-fixture.txt');
    await dashboardPage.fileUpload.pickFile(filePath);
    expect(await dashboardPage.fileUpload.uploadedFileName()).toBe('upload-fixture.txt');
  });
});
