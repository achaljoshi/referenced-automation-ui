import type { Browser, BrowserContext, Page } from '@playwright/test';
import { devices } from '@playwright/test';
import { step } from '../base/step';

export async function setViewport(page: Page, width: number, height: number): Promise<void> {
  await step(`Set viewport ${width}x${height}`, () => page.setViewportSize({ width, height }));
}

/** Common breakpoints, for responsive tests: `setViewport(page, ...breakpoints.tablet)`. */
export const breakpoints = { mobile: [375, 812], tablet: [768, 1024], laptop: [1280, 800], desktop: [1920, 1080] } as const;

export interface MediaOptions {
  colorScheme?: 'light' | 'dark' | 'no-preference' | null;
  reducedMotion?: 'reduce' | 'no-preference' | null;
  forcedColors?: 'active' | 'none' | null;
  /** 'print' to see the print stylesheet. */
  media?: 'screen' | 'print' | null;
}

/** Changes what the page's CSS media queries see: dark mode, reduced motion, high contrast, print. */
export async function emulateMedia(page: Page, options: MediaOptions): Promise<void> {
  await step(`Emulate media ${JSON.stringify(options)}`, () => page.emulateMedia(options));
}

export async function setGeolocation(context: BrowserContext, latitude: number, longitude: number, accuracy = 10): Promise<void> {
  await step(`Set geolocation ${latitude},${longitude}`, async () => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude, longitude, accuracy });
  });
}

export type Permission = 'geolocation' | 'notifications' | 'camera' | 'microphone' | 'clipboard-read' | 'clipboard-write' | 'midi' | 'accelerometer' | 'gyroscope' | 'magnetometer' | 'payment-handler' | 'background-sync' | 'ambient-light-sensor' | 'accessibility-events' | 'midi-sysex' | 'storage-access';

export async function grantPermissions(context: BrowserContext, permissions: Permission[], origin?: string): Promise<void> {
  await step(`Grant permissions ${permissions.join(', ')}`, () => context.grantPermissions(permissions, origin ? { origin } : undefined));
}

export async function clearPermissions(context: BrowserContext): Promise<void> {
  await step('Clear permissions', () => context.clearPermissions());
}

/** The settings of a named Playwright device ('iPhone 15', 'Pixel 7', 'Desktop Safari'), for `newContext`. Unknown names list the valid ones. */
export function deviceSettings(name: string): (typeof devices)[string] {
  const device = devices[name];
  if (!device) throw new Error(`Unknown device "${name}". Examples: ${Object.keys(devices).slice(0, 10).join(', ')} ...`);
  return device;
}

/**
 * A page in its own context with settings fixed when the context is created - locale, timezone, device, color scheme,
 * geolocation, permissions, offline, user agent - which cannot be changed later on an existing page. Close it with
 * `session.close()`.
 *
 *   const session = await newPageWith(browser, { locale: 'de-DE', timezoneId: 'Europe/Berlin' });
 */
export async function newPageWith(
  browser: Browser,
  options: Parameters<Browser['newContext']>[0] & { device?: string },
): Promise<{ page: Page; context: BrowserContext; close: () => Promise<void> }> {
  const { device, ...rest } = options;
  const context = await browser.newContext({ ...(device ? deviceSettings(device) : {}), ...rest });
  const page = await context.newPage();
  return { page, context, close: () => context.close() };
}
