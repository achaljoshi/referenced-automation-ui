import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://app.test/');
  await page.getByRole('textbox', { name: 'Username' }).click();
  await page.getByRole('textbox', { name: 'Username' }).fill('ada');
  await page.getByLabel('Password').click();
  await page.getByLabel('Password').fill('secret');
  await page.getByTestId('login-button').click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.getByLabel('Country').selectOption('uk');
  await page.getByRole('checkbox', { name: 'Subscribe' }).check();
  await page.getByRole('button', { name: 'Load items' }).click();
  await expect(page.getByRole('listitem')).toHaveCount(3);
  await expect(page.getByRole('listitem').first()).toContainText('Item 1');
  await page.locator('iframe[title="Embedded content demo"]').contentFrame().getByRole('button', { name: 'Click inside frame' }).click();
  await expect(page.locator('iframe[title="Embedded content demo"]').contentFrame().locator('#inner-result')).toHaveText('clicked inside frame');
  const page1Promise = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Open new tab' }).click();
  const page1 = await page1Promise;
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download report' }).click();
  const download = await downloadPromise;
  await page.getByLabel('Upload a file').setInputFiles('tests/support/upload-fixture.txt');
  await expect(page.locator('#file-name')).toContainText('upload-fixture.txt');
  await page.waitForTimeout(500);
  await expect(page.getByText('Invalid credentials')).toBeHidden();
  await page.getByRole('heading', { name: 'Dashboard' }).hover();
});
