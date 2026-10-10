/// <reference lib="dom" />
import type { Page } from '@playwright/test';
import { logger } from '@automation/referenced-automation-utils';

export interface NavigationTiming {
  /** Time to first byte, ms. */
  ttfb: number;
  domContentLoaded: number;
  load: number;
  /** Bytes transferred for the document itself. */
  transferSize: number;
  url: string;
}

/** How the last navigation of this page performed, from the browser's own Navigation Timing entry. */
export async function navigationTiming(page: Page): Promise<NavigationTiming> {
  return page.evaluate(() => {
    const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (!entry) throw new Error('No navigation timing entry: has the page loaded?');
    return {
      ttfb: Math.round(entry.responseStart - entry.startTime),
      domContentLoaded: Math.round(entry.domContentLoadedEventEnd - entry.startTime),
      load: Math.round(entry.loadEventEnd - entry.startTime),
      transferSize: entry.transferSize,
      url: entry.name,
    };
  });
}

export interface WebVitals {
  /** Largest Contentful Paint, ms - undefined until the browser has reported one. */
  lcp?: number;
  /** Cumulative Layout Shift (unitless): 0 is perfectly stable. */
  cls: number;
  /** First Contentful Paint, ms. */
  fcp?: number;
}

/**
 * LCP, CLS and FCP as the browser measured them so far (buffered entries - call it after the page has settled).
 * A metric the browser does not report stays undefined: the headless Chromium shell Playwright uses by default
 * produces no paint metrics at all, so run with a headed or `channel: 'chromium'` browser when LCP/FCP matter.
 */
export async function webVitals(page: Page): Promise<WebVitals> {
  return page.evaluate(
    () =>
      new Promise<{ lcp?: number; cls: number; fcp?: number }>((resolve) => {
        const result: { lcp?: number; cls: number; fcp?: number } = { cls: 0 };
        const observe = (type: string, onEntry: (entry: PerformanceEntry) => void) => {
          try {
            const observer = new PerformanceObserver((list) => list.getEntries().forEach(onEntry));
            observer.observe({ type, buffered: true });
          } catch {
            // this browser does not report this metric
          }
        };
        observe('largest-contentful-paint', (entry) => (result.lcp = Math.round(entry.startTime)));
        observe('layout-shift', (entry) => {
          const shift = entry as unknown as { value: number; hadRecentInput: boolean };
          if (!shift.hadRecentInput) result.cls += shift.value;
        });
        observe('paint', (entry) => {
          if (entry.name === 'first-contentful-paint') result.fcp = Math.round(entry.startTime);
        });
        // buffered observers deliver their entries on the next task: answer after that, without a timer race
        requestAnimationFrame(() => setTimeout(() => resolve({ ...result, cls: Math.round(result.cls * 1000) / 1000 }), 0));
      }),
  );
}

export interface PerformanceBudget {
  ttfbMs?: number;
  domContentLoadedMs?: number;
  loadMs?: number;
  lcpMs?: number;
  /** Layout shift. Google's "good" threshold is 0.1. */
  cls?: number;
  transferBytes?: number;
}

/**
 * Fails, naming every metric that is over, if the page is slower or less stable than the budget - and fails when a
 * budgeted metric (LCP, say) was not reported by the browser, instead of skipping it. A guard against
 * regressions in CI - the numbers vary by machine, so set budgets with headroom (and run on the same kind of runner),
 * and use a real performance tool for measuring.
 */
export async function expectWithinBudget(page: Page, budget: PerformanceBudget): Promise<{ timing: NavigationTiming; vitals: WebVitals }> {
  const timing = await navigationTiming(page);
  const vitals = await webVitals(page);
  logger.info(`Performance: ttfb ${timing.ttfb}ms, DCL ${timing.domContentLoaded}ms, load ${timing.load}ms, LCP ${vitals.lcp ?? 'n/a'}ms, CLS ${vitals.cls}`);
  const over: string[] = [];
  const unreported: string[] = [];
  const check = (name: string, actual: number | undefined, limit: number | undefined, unit: string) => {
    if (limit === undefined) return;
    if (actual === undefined) unreported.push(name);
    else if (actual > limit) over.push(`${name} ${actual}${unit} > ${limit}${unit}`);
  };
  check('TTFB', timing.ttfb, budget.ttfbMs, 'ms');
  check('DOMContentLoaded', timing.domContentLoaded, budget.domContentLoadedMs, 'ms');
  check('load', timing.load, budget.loadMs, 'ms');
  check('LCP', vitals.lcp, budget.lcpMs, 'ms');
  check('CLS', vitals.cls, budget.cls, '');
  check('transfer size', timing.transferSize, budget.transferBytes, ' bytes');
  // A budget on a metric the browser did not report cannot be met or missed: that is a failed check, not a pass.
  if (unreported.length > 0) {
    throw new Error(
      `The browser did not report ${unreported.join(', ')}, which the budget limits - it cannot be checked. ` +
        `Headless Chromium shell reports no paint metrics: run headed or with \`channel: 'chromium'\`, or drop the budget for that metric.` +
        (over.length > 0 ? ` Also over the performance budget: ${over.join('; ')}` : ''),
    );
  }
  if (over.length > 0) throw new Error(`Over the performance budget: ${over.join('; ')}`);
  return { timing, vitals };
}
