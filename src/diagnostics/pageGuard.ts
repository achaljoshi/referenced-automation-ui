import type { ConsoleMessage, Page, Request, Response, TestInfo } from '@playwright/test';

export interface PageProblem {
  kind: 'console-error' | 'console-warning' | 'page-error' | 'request-failed' | 'http-error';
  text: string;
  url?: string;
}

export interface PageGuardOptions {
  /** Console messages / page errors / URLs matching any of these are not problems (a known third-party error). */
  ignore?: Array<string | RegExp>;
  /** Count console warnings as problems too. Default false. */
  warnings?: boolean;
  /** Count 4xx/5xx responses as problems. Default true. 404s for favicons are ignored. */
  httpErrors?: boolean;
  /** Count requests that failed at the network level. Default true. */
  failedRequests?: boolean;
}

export interface PageGuard {
  readonly problems: readonly PageProblem[];
  /** Throws, listing every problem, if any occurred. */
  expectClean(): void;
  /** Writes the problems to the test report as an attachment (nothing is written when there are none). */
  attach(testInfo: TestInfo): Promise<void>;
  stop(): void;
}

const matches = (text: string, patterns: Array<string | RegExp>) => patterns.some((p) => (typeof p === 'string' ? text.includes(p) : p.test(text)));

/**
 * Watches a page for the things a user would never see but a test should care about: console errors, uncaught
 * exceptions, failed requests and 4xx/5xx responses. A page that "passes" with errors thrown in the console is
 * usually a page that is half broken.
 */
export function guardPage(page: Page, options: PageGuardOptions = {}): PageGuard {
  const ignore = options.ignore ?? [];
  const problems: PageProblem[] = [];
  const add = (problem: PageProblem) => {
    if (!matches(problem.text, ignore) && !(problem.url && matches(problem.url, ignore))) problems.push(problem);
  };

  const onConsole = (message: ConsoleMessage) => {
    // Chromium also logs "Failed to load resource: ... status of 404 / net::ERR_..." for every network problem; those are
    // already reported, with the URL, as http-error / request-failed, so listing them again would count each twice.
    const text = message.text();
    const duplicate = /^Failed to load resource/.test(text) && ((/status of \d+/.test(text) && options.httpErrors !== false) || (/net::ERR/.test(text) && options.failedRequests !== false));
    if (duplicate) return;
    if (message.type() === 'error') add({ kind: 'console-error', text, url: message.location().url });
    else if (options.warnings && message.type() === 'warning') add({ kind: 'console-warning', text: message.text(), url: message.location().url });
  };
  const onPageError = (error: Error) => add({ kind: 'page-error', text: error.message });
  const onFailed = (request: Request) => {
    if (options.failedRequests !== false) add({ kind: 'request-failed', text: `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`, url: request.url() });
  };
  const onResponse = (response: Response) => {
    if (options.httpErrors === false || response.status() < 400 || /favicon/i.test(response.url())) return;
    add({ kind: 'http-error', text: `${response.request().method()} ${response.url()} -> ${response.status()}`, url: response.url() });
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('requestfailed', onFailed);
  page.on('response', onResponse);

  const format = () => problems.map((p) => `[${p.kind}] ${p.text}`).join('\n');
  return {
    problems,
    expectClean() {
      if (problems.length > 0) throw new Error(`${problems.length} problem(s) on the page:\n${format()}`);
    },
    async attach(testInfo) {
      if (problems.length > 0) await testInfo.attach('page-problems.txt', { body: format(), contentType: 'text/plain' });
    },
    stop() {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('requestfailed', onFailed);
      page.off('response', onResponse);
    },
  };
}
