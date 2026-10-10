import type { BrowserContext, Page, Request, Response, Route } from '@playwright/test';
import { expect } from '@playwright/test';
import { logger } from '@automation/referenced-automation-utils';
import { step } from '../base/step';

export type UrlMatch = string | RegExp | ((url: URL) => boolean);

/** Waits for a request matching `urlPattern` while `action` runs - the request-side twin of `actions.waitForResponseMatching`. */
export async function waitForRequestMatching(page: Page, urlPattern: string | RegExp, action: () => Promise<void>): Promise<Request> {
  const [request] = await Promise.all([page.waitForRequest(urlPattern), action()]);
  return request;
}

/** Runs `action` and returns the response (and parsed JSON body) of the call it triggers - what the UI sent and what came back. */
export async function captureApiCall(
  page: Page,
  urlPattern: string | RegExp,
  action: () => Promise<void>,
): Promise<{ request: Request; response: Response; requestBody: unknown; responseBody: unknown }> {
  const [request, response] = await Promise.all([page.waitForRequest(urlPattern), page.waitForResponse(urlPattern), action()]);
  const text = await response.text();
  const parse = (value: string | null): unknown => {
    if (value === null || value === '') return undefined;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  };
  return { request, response, requestBody: parse(request.postData()), responseBody: parse(text) };
}

export interface MockJsonOptions {
  status?: number;
  headers?: Record<string, string>;
  /** Only this HTTP method is mocked; others pass through. */
  method?: string;
  /** Mock this many requests, then let the rest through (a "first call fails, second succeeds" test). */
  times?: number;
  /** Wait this long before answering - for loading-state tests. */
  delayMs?: number;
}

/** Answers matching requests with JSON instead of reaching the network. */
export async function mockJson(page: Page | BrowserContext, urlPattern: string | RegExp, body: unknown, options: MockJsonOptions = {}): Promise<void> {
  await step(`Mock JSON ${options.method ?? 'any method'} ${String(urlPattern)} -> ${options.status ?? 200}`, () =>
    page.route(
      urlPattern,
      async (route) => {
        if (options.method && route.request().method() !== options.method.toUpperCase()) return route.fallback();
        if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
        await route.fulfill({ status: options.status ?? 200, headers: options.headers, json: body });
      },
      { times: options.times },
    ),
  );
}

/** Answers matching requests with an error status and no useful body - to see how the page handles a failing dependency. */
export async function mockStatus(page: Page | BrowserContext, urlPattern: string | RegExp, status: number, options: { times?: number } = {}): Promise<void> {
  await step(`Mock status ${status} ${String(urlPattern)}`, () =>
    page.route(urlPattern, (route) => route.fulfill({ status, body: '' }), { times: options.times }),
  );
}

/** Lets the real request through and edits the real JSON response: `modifyJsonResponse(page, '**\/api/orders', (o) => ({ ...o, total: 0 }))`. */
export async function modifyJsonResponse(page: Page | BrowserContext, urlPattern: string | RegExp, edit: (body: any) => unknown): Promise<void> {
  await step(`Modify JSON response ${String(urlPattern)}`, () =>
    page.route(urlPattern, async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, json: edit(await response.json()) });
    }),
  );
}

/** Passes the request on with changes (to the next handler, or the network): extra/overridden headers, a different body, a different URL or method. */
export async function modifyRequest(
  page: Page | BrowserContext,
  urlPattern: string | RegExp,
  changes: { headers?: Record<string, string>; postData?: string | Buffer; method?: string; url?: string },
): Promise<void> {
  await step(`Modify request ${String(urlPattern)}`, () =>
    // fallback, not continue: the edited request is handed to the next handler (a mock, a HAR) or the network, so this composes.
    page.route(urlPattern, (route: Route) => route.fallback({ ...changes, headers: changes.headers ? { ...route.request().headers(), ...changes.headers } : undefined })),
  );
}

export type ResourceType = 'image' | 'font' | 'media' | 'stylesheet' | 'script' | 'xhr' | 'fetch' | 'document' | 'websocket' | 'other';

/** Aborts requests by resource type (and/or URL pattern): block images and fonts to speed a page up, or analytics to keep a test deterministic. */
export async function blockResources(page: Page | BrowserContext, options: { types?: ResourceType[]; urls?: Array<string | RegExp> }): Promise<void> {
  await step(`Block ${[...(options.types ?? []), ...(options.urls ?? []).map(String)].join(', ')}`, async () => {
    if (options.types?.length) {
      await page.route('**/*', (route) => (options.types?.includes(route.request().resourceType() as ResourceType) ? route.abort() : route.fallback()));
    }
    for (const url of options.urls ?? []) await page.route(url, (route) => route.abort());
  });
}

/** Replays (or records) traffic from a HAR file: `routeFromHar(page, 'har/orders.har', { url: '**\/api/**' })`. With `update: true` the real traffic is recorded into it instead. */
export async function routeFromHar(
  page: Page | BrowserContext,
  harFile: string,
  options: { url?: string | RegExp; update?: boolean; notFound?: 'abort' | 'fallback' } = {},
): Promise<void> {
  await step(`${options.update ? 'Record' : 'Replay'} HAR ${harFile}`, () => page.routeFromHAR(harFile, { url: options.url, update: options.update, notFound: options.notFound ?? 'abort' }));
}

/**
 * A fake WebSocket server for `url`: `onMessage` gets each message the page sends and a `send` to answer with. Nothing
 * reaches the real server. (To proxy to the real one and edit messages in between, use `page.routeWebSocket` directly.)
 */
export async function mockWebSocket(
  page: Page | BrowserContext,
  url: string | RegExp,
  onMessage: (message: string | Buffer, send: (reply: string | Buffer) => void) => void,
  options: { greeting?: string } = {},
): Promise<void> {
  await step(`Mock WebSocket ${String(url)}`, () =>
    page.routeWebSocket(url, (ws) => {
      if (options.greeting !== undefined) ws.send(options.greeting);
      ws.onMessage((message) => onMessage(message, (reply) => ws.send(reply)));
    }),
  );
}

export async function setOffline(context: BrowserContext, offline: boolean): Promise<void> {
  await step(offline ? 'Go offline' : 'Go online', () => context.setOffline(offline));
}

/** Adds headers to every request the context makes (an auth header, a feature-flag header, `Accept-Language`). */
export async function setExtraHeaders(context: BrowserContext, headers: Record<string, string>): Promise<void> {
  await step(`Set extra headers: ${Object.keys(headers).join(', ')}`, () => context.setExtraHTTPHeaders(headers));
}

/**
 * Slows the network (Chromium only - it uses the DevTools protocol): latency in ms, throughput in kilobytes per second.
 * Use it for loading-state and timeout behaviour, not as a performance measurement.
 */
export async function throttleNetwork(page: Page, options: { latencyMs: number; downloadKbps: number; uploadKbps?: number }): Promise<void> {
  await step(`Throttle network: ${options.latencyMs}ms, ${options.downloadKbps} KB/s`, async () => {
    const session = await page.context().newCDPSession(page);
    await session.send('Network.enable');
    await session.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: options.latencyMs,
      downloadThroughput: options.downloadKbps * 1024,
      uploadThroughput: (options.uploadKbps ?? options.downloadKbps) * 1024,
    });
  });
}

export interface NetworkLog {
  /** Every request the page made since tracking started. */
  readonly requests: readonly Request[];
  /** Requests that failed at the network level (DNS, refused, aborted), with the reason. */
  readonly failures: ReadonlyArray<{ url: string; method: string; reason: string }>;
  /** Responses with a 4xx/5xx status. */
  readonly errorResponses: ReadonlyArray<{ url: string; method: string; status: number }>;
  /** Requests still waiting for an answer. */
  inFlight(): number;
  /** Requests whose URL matches. */
  find(match: UrlMatch): Request[];
  /** Throws if any request failed or got a 4xx/5xx, naming each; `ignore` skips URLs (e.g. a known-broken analytics call). */
  expectNoErrors(options?: { ignore?: Array<string | RegExp>; allowStatuses?: number[] }): void;
  /** Resolves when no request has been in flight for `quietMs` - a signal built from the page's own traffic, unlike `networkidle`. */
  waitUntilQuiet(options?: { quietMs?: number; timeoutMs?: number }): Promise<void>;
  stop(): void;
}

/** A Playwright-style glob (`**` any characters, `*` anything but `/`) as a regular expression. */
function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\*\*/g, '\uE000').replace(/\*/g, '[^/]*').replace(/\uE000/g, '.*')}$`);
}

const matches = (url: string, match: UrlMatch): boolean => {
  if (typeof match === 'function') return match(new URL(url));
  if (match instanceof RegExp) return match.test(url);
  return match.includes('*') ? globToRegExp(match).test(url) : url.includes(match);
};

/**
 * Starts recording the page's network traffic: what it asked for, what failed, what answered 4xx/5xx. The record is
 * what a test asserts on ("no failed requests", "the page called /api/orders once") and what explains a failure.
 */
export function trackNetwork(page: Page): NetworkLog {
  const requests: Request[] = [];
  const failures: Array<{ url: string; method: string; reason: string }> = [];
  const errorResponses: Array<{ url: string; method: string; status: number }> = [];
  const pending = new Set<Request>();
  let lastActivity = Date.now();

  const onRequest = (request: Request) => {
    requests.push(request);
    pending.add(request);
    lastActivity = Date.now();
  };
  const onFinished = (request: Request) => {
    pending.delete(request);
    lastActivity = Date.now();
  };
  const onFailed = (request: Request) => {
    pending.delete(request);
    lastActivity = Date.now();
    failures.push({ url: request.url(), method: request.method(), reason: request.failure()?.errorText ?? 'unknown' });
  };
  const onResponse = (response: Response) => {
    if (response.status() >= 400) errorResponses.push({ url: response.url(), method: response.request().method(), status: response.status() });
  };
  page.on('request', onRequest);
  page.on('requestfinished', onFinished);
  page.on('requestfailed', onFailed);
  page.on('response', onResponse);

  return {
    requests,
    failures,
    errorResponses,
    inFlight: () => pending.size,
    find: (match) => requests.filter((request) => matches(request.url(), match)),
    expectNoErrors(options = {}) {
      const ignored = (url: string) => (options.ignore ?? []).some((m) => matches(url, m));
      const bad = [
        ...failures.filter((f) => !ignored(f.url)).map((f) => `${f.method} ${f.url} failed: ${f.reason}`),
        ...errorResponses.filter((r) => !ignored(r.url) && !(options.allowStatuses ?? []).includes(r.status)).map((r) => `${r.method} ${r.url} -> ${r.status}`),
      ];
      if (bad.length > 0) throw new Error(`${bad.length} network problem(s):\n  ${bad.join('\n  ')}`);
    },
    async waitUntilQuiet(options = {}) {
      const quietMs = options.quietMs ?? 500;
      const deadline = Date.now() + (options.timeoutMs ?? 15_000);
      // Polling the page's own record of traffic (not a fixed sleep): returns the moment it has been quiet long enough.
      await expect
        .poll(() => pending.size === 0 && Date.now() - lastActivity >= quietMs, { timeout: Math.max(1, deadline - Date.now()), intervals: [50, 100, 250], message: `network did not go quiet for ${quietMs}ms` })
        .toBe(true);
    },
    stop() {
      page.off('request', onRequest);
      page.off('requestfinished', onFinished);
      page.off('requestfailed', onFailed);
      page.off('response', onResponse);
      logger.info(`Network tracking stopped: ${requests.length} request(s), ${failures.length} failed, ${errorResponses.length} with 4xx/5xx`);
    },
  };
}
