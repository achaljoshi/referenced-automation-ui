/// <reference lib="dom" />
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Browser, BrowserContext, Cookie, Page } from '@playwright/test';
import { step } from '../base/step';

/** Writes the context's cookies and localStorage to a file (a login you can reuse - treat the file as a credential and keep it out of git). */
export async function saveStorageState(context: BrowserContext, file: string): Promise<void> {
  await step(`Save storage state -> ${file}`, async () => {
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    await context.storageState({ path: file });
  });
}

/**
 * A page that is already signed in as whoever saved `storageStateFile`, in its own isolated context - for tests with
 * more than one user in the same scenario (admin approves what a user requested). Close it with `session.close()`.
 */
export async function pageAs(
  browser: Browser,
  storageStateFile: string,
  contextOptions: Parameters<Browser['newContext']>[0] = {},
): Promise<{ page: Page; context: BrowserContext; close: () => Promise<void> }> {
  const context = await browser.newContext({ ...contextOptions, storageState: storageStateFile });
  const page = await context.newPage();
  return { page, context, close: () => context.close() };
}

// ---- cookies ----

export async function getCookies(context: BrowserContext, urls?: string[]): Promise<Cookie[]> {
  return context.cookies(urls);
}

/** One cookie by name, or undefined. */
export async function getCookie(context: BrowserContext, name: string, urls?: string[]): Promise<Cookie | undefined> {
  return (await context.cookies(urls)).find((cookie) => cookie.name === name);
}

export async function addCookie(context: BrowserContext, cookie: { name: string; value: string; url?: string; domain?: string; path?: string; httpOnly?: boolean; secure?: boolean; sameSite?: 'Strict' | 'Lax' | 'None'; expires?: number }): Promise<void> {
  // Playwright wants a `url` OR a `domain` + `path`, never both: default the path only when no url was given.
  await step(`Add cookie ${cookie.name}`, () => context.addCookies([(cookie.url ? cookie : { path: '/', ...cookie }) as Cookie]));
}

export async function clearCookies(context: BrowserContext, filter?: { name?: string | RegExp; domain?: string | RegExp }): Promise<void> {
  await step(`Clear cookies${filter ? ` ${JSON.stringify(filter, (_k, v) => (v instanceof RegExp ? String(v) : v))}` : ''}`, () => context.clearCookies(filter));
}

// ---- web storage (the page must be on the origin: goto first) ----

type Store = 'localStorage' | 'sessionStorage';

async function read(page: Page, store: Store, key?: string): Promise<string | null | Record<string, string>> {
  return page.evaluate(
    ([which, k]) => {
      const area = which === 'localStorage' ? window.localStorage : window.sessionStorage;
      if (k !== undefined) return area.getItem(k);
      return Object.fromEntries(Object.keys(area).map((name) => [name, area.getItem(name) as string]));
    },
    [store, key] as const,
  );
}

export async function getLocalStorage(page: Page, key: string): Promise<string | null> {
  return (await read(page, 'localStorage', key)) as string | null;
}

export async function allLocalStorage(page: Page): Promise<Record<string, string>> {
  return (await read(page, 'localStorage')) as Record<string, string>;
}

export async function setLocalStorage(page: Page, key: string, value: string): Promise<void> {
  await step(`Set localStorage ${key}`, () => page.evaluate(([k, v]) => window.localStorage.setItem(k as string, v as string), [key, value]));
}

export async function clearLocalStorage(page: Page): Promise<void> {
  await step('Clear localStorage', () => page.evaluate(() => window.localStorage.clear()));
}

export async function getSessionStorage(page: Page, key: string): Promise<string | null> {
  return (await read(page, 'sessionStorage', key)) as string | null;
}

export async function allSessionStorage(page: Page): Promise<Record<string, string>> {
  return (await read(page, 'sessionStorage')) as Record<string, string>;
}

export async function setSessionStorage(page: Page, key: string, value: string): Promise<void> {
  await step(`Set sessionStorage ${key}`, () => page.evaluate(([k, v]) => window.sessionStorage.setItem(k as string, v as string), [key, value]));
}

/**
 * sessionStorage is not part of Playwright's storage state. If the app keeps its login there, save it with this after
 * logging in, and restore it into a new context with `restoreSessionStorage` BEFORE the first navigation.
 */
export async function saveSessionStorage(page: Page, file: string): Promise<void> {
  await step(`Save sessionStorage -> ${file}`, async () => {
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ origin: new URL(page.url()).origin, items: await allSessionStorage(page) }));
  });
}

export async function restoreSessionStorage(context: BrowserContext, file: string): Promise<void> {
  await step(`Restore sessionStorage <- ${file}`, async () => {
    const { origin, items } = JSON.parse(fs.readFileSync(file, 'utf8')) as { origin: string; items: Record<string, string> };
    await context.addInitScript(
      ([expectedOrigin, saved]) => {
        if (window.location.origin !== expectedOrigin) return;
        for (const [key, value] of Object.entries(saved as Record<string, string>)) window.sessionStorage.setItem(key, value);
      },
      [origin, items] as const,
    );
  });
}
