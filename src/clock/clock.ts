import type { Page } from '@playwright/test';
import { step } from '../base/step';

/**
 * Control of time in the page (Date, setTimeout, setInterval, requestAnimationFrame) - so a session timeout, a
 * countdown or a "5 minutes ago" label is tested by moving the clock, not by waiting. Install BEFORE the page's own
 * scripts need the time: call `installClock` before `goto`.
 */

/** Takes over the page's clock, starting at `time` (default: now). Required before pause / fast-forward / run. */
export async function installClock(page: Page, time?: Date | string | number): Promise<void> {
  await step(`Install clock${time !== undefined ? ` at ${new Date(time).toISOString()}` : ''}`, () => page.clock.install(time !== undefined ? { time } : undefined));
}

/** `Date.now()` and `new Date()` return this fixed time; timers keep running. The simplest option - try it first. */
export async function setFixedTime(page: Page, time: Date | string | number): Promise<void> {
  await step(`Fix time at ${new Date(time).toISOString()}`, () => page.clock.setFixedTime(time));
}

/** Freezes time at `time` (the page sees nothing move until you advance it). Needs `installClock`. */
export async function pauseClockAt(page: Page, time: Date | string | number): Promise<void> {
  await step(`Pause clock at ${new Date(time).toISOString()}`, () => page.clock.pauseAt(time));
}

/** Jumps ahead: milliseconds or a 'mm:ss' / 'hh:mm:ss' string. Timers that fall due fire once, as when a laptop wakes. */
export async function fastForward(page: Page, by: number | string): Promise<void> {
  await step(`Fast-forward clock ${by}`, () => page.clock.fastForward(by));
}

/** Advances in order, firing every timer and animation frame on the way - for countdowns and polling that must tick. */
export async function runClockFor(page: Page, by: number | string): Promise<void> {
  await step(`Run clock for ${by}`, () => page.clock.runFor(by));
}

export async function resumeClock(page: Page): Promise<void> {
  await step('Resume clock', () => page.clock.resume());
}
