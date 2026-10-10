import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test, expect } from '../src/fixtures/uiFixtures';
import * as actions from '../src/actions';
import * as assertions from '../src/assertions';
import * as storage from '../src/storage/storage';
import * as emulation from '../src/emulation/emulation';
import * as clock from '../src/clock/clock';
import { startAppServer, type AppServer } from './support/appServer';
import { servePage } from './support/servePage';

let app: AppServer;
test.beforeAll(async () => {
  app = await startAppServer();
});
test.afterAll(async () => {
  await app.stop();
});

test.describe('storage', () => {
  test('cookies: add, read one, read all, clear by filter', async ({ page, context }) => {
    await actions.goto(page, app.url);
    await storage.addCookie(context, { name: 'theme', value: 'dark', url: app.url });
    await storage.addCookie(context, { name: 'sid', value: 'abc', url: app.url, httpOnly: true });
    expect((await storage.getCookie(context, 'theme', [app.url]))?.value).toBe('dark');
    expect((await storage.getCookies(context, [app.url])).map((c) => c.name).sort()).toEqual(['sid', 'theme']);
    expect(await storage.getCookie(context, 'nope')).toBeUndefined();
    await storage.clearCookies(context, { name: 'theme' });
    expect((await storage.getCookies(context, [app.url])).map((c) => c.name)).toEqual(['sid']);
    await storage.clearCookies(context);
    expect(await storage.getCookies(context, [app.url])).toEqual([]);
  });

  test('localStorage and sessionStorage: set, get, all, clear', async ({ page }) => {
    await actions.goto(page, app.url);
    await storage.setLocalStorage(page, 'token', 't1');
    await storage.setLocalStorage(page, 'lang', 'en');
    expect(await storage.getLocalStorage(page, 'token')).toBe('t1');
    expect(await storage.getLocalStorage(page, 'missing')).toBeNull();
    expect(await storage.allLocalStorage(page)).toEqual({ token: 't1', lang: 'en' });
    await storage.clearLocalStorage(page);
    expect(await storage.allLocalStorage(page)).toEqual({});
    await storage.setSessionStorage(page, 'step', '3');
    expect(await storage.getSessionStorage(page, 'step')).toBe('3');
    expect(await storage.allSessionStorage(page)).toEqual({ step: '3' });
  });

  test('saveStorageState + pageAs: a second user signed in from a saved state, in its own context', async ({ page, context, pageAs }) => {
    await actions.goto(page, app.url);
    await storage.addCookie(context, { name: 'sid', value: 'user-one', url: app.url });
    await storage.setLocalStorage(page, 'who', 'one');
    const file = path.join(os.tmpdir(), `state-${Date.now()}`, 'one.json');
    await storage.saveStorageState(context, file);
    expect(fs.existsSync(file)).toBe(true);

    const second = await pageAs(file);
    await actions.goto(second, app.url);
    expect(await storage.getLocalStorage(second, 'who')).toBe('one');
    expect((await storage.getCookie(second.context(), 'sid', [app.url]))?.value).toBe('user-one');
    expect(second.context()).not.toBe(context);
  });

  test('sessionStorage survives into a new context with saveSessionStorage / restoreSessionStorage', async ({ page, browser }) => {
    await actions.goto(page, app.url);
    await storage.setSessionStorage(page, 'auth', 'session-token');
    const file = path.join(os.tmpdir(), `session-${Date.now()}.json`);
    await storage.saveSessionStorage(page, file);

    const fresh = await browser.newContext();
    await storage.restoreSessionStorage(fresh, file);
    const restored = await fresh.newPage();
    await actions.goto(restored, app.url);
    expect(await storage.getSessionStorage(restored, 'auth')).toBe('session-token');
    await fresh.close();
  });
});

test.describe('emulation', () => {
  test('setViewport and breakpoints', async ({ page }) => {
    await servePage(page, '<p id="w"></p><script>w.textContent = innerWidth + "x" + innerHeight</script>');
    await emulation.setViewport(page, ...emulation.breakpoints.tablet);
    expect(await page.evaluate(() => `${innerWidth}x${innerHeight}`)).toBe('768x1024');
  });

  test('emulateMedia: dark mode, reduced motion, print', async ({ page }) => {
    await servePage(page, '<p>x</p>');
    const matches = (query: string) => page.evaluate((q) => matchMedia(q).matches, query);
    await emulation.emulateMedia(page, { colorScheme: 'dark', reducedMotion: 'reduce' });
    expect(await matches('(prefers-color-scheme: dark)')).toBe(true);
    expect(await matches('(prefers-reduced-motion: reduce)')).toBe(true);
    await emulation.emulateMedia(page, { colorScheme: 'light', media: 'print' });
    expect(await matches('(prefers-color-scheme: dark)')).toBe(false);
    expect(await matches('print')).toBe(true);
  });

  test('geolocation and permissions', async ({ page, context }) => {
    await actions.goto(page, app.url);
    await emulation.setGeolocation(context, 51.5, -0.12);
    const position = await page.evaluate(() => new Promise<[number, number]>((resolve, reject) => navigator.geolocation.getCurrentPosition((p) => resolve([p.coords.latitude, p.coords.longitude]), reject)));
    expect(position).toEqual([51.5, -0.12]);
    const state = (name: string) => page.evaluate(async (n) => (await navigator.permissions.query({ name: n as PermissionName })).state, name);
    expect(await state('geolocation')).toBe('granted');
    await emulation.clearPermissions(context);
    expect(await state('geolocation')).toBe('prompt');
    await emulation.grantPermissions(context, ['geolocation'], app.url);
    expect(await state('geolocation')).toBe('granted');
  });

  test('newPageWith fixes locale, timezone and device at context creation', async ({ browser }) => {
    const session = await emulation.newPageWith(browser, { locale: 'de-DE', timezoneId: 'Asia/Tokyo' });
    await actions.goto(session.page, app.url);
    expect(await session.page.evaluate(() => navigator.language)).toBe('de-DE');
    expect(await session.page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe('Asia/Tokyo');
    await session.close();

    const phone = await emulation.newPageWith(browser, { device: 'iPhone 15' });
    await actions.goto(phone.page, app.url);
    expect(await phone.page.evaluate(() => screen.width)).toBe(393);
    expect(await phone.page.evaluate(() => 'ontouchstart' in window)).toBe(true);
    await phone.close();
  });

  test('an unknown device lists examples', () => {
    expect(() => emulation.deviceSettings('Nokia 3310')).toThrow(/Unknown device "Nokia 3310". Examples:/);
    expect(emulation.deviceSettings('Pixel 7').isMobile).toBe(true);
  });
});

test.describe('clock', () => {
  const CLOCK_PAGE = `
    <span id="now"></span><span id="ticks">0</span><span id="logout"></span>
    <script>
      const show = () => document.getElementById('now').textContent = new Date().toISOString();
      show(); setInterval(() => { document.getElementById('ticks').textContent = Number(document.getElementById('ticks').textContent) + 1; show(); }, 1000);
      setTimeout(() => document.getElementById('logout').textContent = 'logged out', 5 * 60 * 1000);
    </script>`;

  test('setFixedTime: Date reports the fixed time', async ({ page }) => {
    await clock.setFixedTime(page, new Date('2024-02-02T10:00:00Z'));
    await servePage(page, CLOCK_PAGE);
    await assertions.toHaveText(page.locator('#now'), '2024-02-02T10:00:00.000Z');
  });

  test('install + fastForward: a five-minute session timeout without waiting five minutes', async ({ page }) => {
    await clock.installClock(page, new Date('2024-02-02T08:00:00Z'));
    await servePage(page, CLOCK_PAGE);
    await assertions.toHaveText(page.locator('#logout'), '');
    await clock.fastForward(page, '05:01');
    await assertions.toHaveText(page.locator('#logout'), 'logged out');
  });

  test('runClockFor fires every timer on the way; pauseClockAt freezes; resumeClock restarts', async ({ page }) => {
    await clock.installClock(page, new Date('2024-02-02T08:00:00Z'));
    await servePage(page, CLOCK_PAGE);
    await clock.runClockFor(page, 3000);
    await assertions.toHaveText(page.locator('#ticks'), '3');
    await clock.pauseClockAt(page, new Date('2024-02-02T09:00:00Z'));
    await assertions.toHaveText(page.locator('#now'), '2024-02-02T09:00:00.000Z');
    await clock.resumeClock(page);
    await expect(page.locator('#ticks')).not.toHaveText('3');
  });
});
