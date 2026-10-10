import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test, expect } from '../src/fixtures/uiFixtures';
import * as actions from '../src/actions';
import * as assertions from '../src/assertions';
import * as network from '../src/network/network';
import { startAppServer, type AppServer } from './support/appServer';

let app: AppServer;
const items = '**/api/items*';

test.beforeAll(async () => {
  app = await startAppServer();
});
test.afterAll(async () => {
  await app.stop();
});
test.beforeEach(() => {
  app.state.source = 'real';
});

test.describe('network', () => {
  test('waitForRequestMatching returns the request the click caused', async ({ page }) => {
    await actions.goto(page, app.url);
    const request = await network.waitForRequestMatching(page, items, () => actions.click(page.locator('#load')));
    expect(request.url()).toContain('page=1');
    expect(request.headers()['x-client']).toBe('test');
  });

  test('captureApiCall gives the request, the response and both parsed bodies', async ({ page }) => {
    await actions.goto(page, app.url);
    const call = await network.captureApiCall(page, items, () => actions.click(page.locator('#load')));
    expect(call.response.status()).toBe(200);
    expect(call.responseBody).toEqual({ items: ['a', 'b'], source: 'real' });
    expect(call.requestBody).toBeUndefined();
  });

  test('mockJson answers with JSON; times limits it, so the next request reaches the real server; delayMs shows the loading state', async ({ page }) => {
    await actions.goto(page, app.url);
    await network.mockJson(page, items, { items: ['x', 'y', 'z'], source: 'mock' }, { times: 1, delayMs: 300 });
    await actions.click(page.locator('#load'));
    await assertions.toHaveText(page.locator('#status'), 'loading');
    await assertions.toHaveText(page.locator('#status'), 'loaded mock');
    await assertions.toHaveCount(page.locator('#items li'), 3);
    await actions.click(page.locator('#load'));
    await assertions.toHaveText(page.locator('#status'), 'loaded real');
  });

  test('mockJson restricted to another HTTP method leaves GET alone', async ({ page }) => {
    await actions.goto(page, app.url);
    await network.mockJson(page, items, { items: [], source: 'post-mock' }, { method: 'POST' });
    await actions.click(page.locator('#load'));
    await assertions.toHaveText(page.locator('#status'), 'loaded real');
  });

  test('mockStatus simulates a failing dependency', async ({ page }) => {
    await actions.goto(page, app.url);
    await network.mockStatus(page, items, 503);
    await actions.click(page.locator('#load'));
    await assertions.toHaveText(page.locator('#status'), 'error 503');
  });

  test('modifyJsonResponse edits the REAL response', async ({ page }) => {
    await actions.goto(page, app.url);
    await network.modifyJsonResponse(page, items, (body) => ({ ...body, items: [...body.items, 'injected'], source: 'edited' }));
    await actions.click(page.locator('#load'));
    await assertions.toHaveText(page.locator('#status'), 'loaded edited');
    await assertions.toHaveText(page.locator('#items li'), ['a', 'b', 'injected']);
  });

  test('modifyRequest adds a header to the request that goes out, keeping the ones the page set', async ({ page }) => {
    await actions.goto(page, app.url);
    await network.modifyRequest(page, items, { headers: { 'X-Added': 'yes' } });
    await actions.click(page.locator('#load'));
    await assertions.toHaveText(page.locator('#status'), 'loaded real');
    expect(app.lastItemsHeaders['x-added']).toBe('yes');
    expect(app.lastItemsHeaders['x-client']).toBe('test');
  });

  test('modifyRequest composes with a mock: the mock sees the edited request', async ({ page }) => {
    await actions.goto(page, app.url);
    let seen: Record<string, string> = {};
    await page.route(items, (route) => {
      seen = route.request().headers();
      return route.fulfill({ json: { items: [], source: 'mock' } });
    });
    await network.modifyRequest(page, items, { headers: { 'X-Added': 'yes' } });
    await actions.click(page.locator('#load'));
    await assertions.toHaveText(page.locator('#status'), 'loaded mock');
    expect(seen['x-added']).toBe('yes');
  });

  test('blockResources aborts by type and by URL', async ({ page }) => {
    await network.blockResources(page, { types: ['image'], urls: [/\/api\/items/] });
    await actions.goto(page, app.url);
    await actions.click(page.locator('#load'));
    await assertions.toHaveText(page.locator('#status'), 'failed');
    expect(await page.locator('#pic').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(0);
  });

  test('routeFromHar records real traffic, and later replays it without the server', async ({ browser }) => {
    const har = path.join(os.tmpdir(), `net-${Date.now()}.har`);
    const recording = await browser.newContext();
    const recordingPage = await recording.newPage();
    await network.routeFromHar(recordingPage, har, { url: items, update: true });
    await actions.goto(recordingPage, app.url);
    await actions.click(recordingPage.locator('#load'));
    await assertions.toHaveText(recordingPage.locator('#status'), 'loaded real');
    await recording.close(); // the HAR is written when the context closes
    expect(fs.existsSync(har)).toBe(true);

    app.state.source = 'changed-since'; // a replay that still says "real" proves the server was not asked
    const replaying = await browser.newContext();
    const replayPage = await replaying.newPage();
    await network.routeFromHar(replayPage, har, { url: items });
    await actions.goto(replayPage, app.url);
    await actions.click(replayPage.locator('#load'));
    await assertions.toHaveText(replayPage.locator('#status'), 'loaded real');
    await replaying.close();
  });

  test('mockWebSocket is a fake server: greeting, then an answer to each message', async ({ page }) => {
    await actions.goto(page, app.url);
    await network.mockWebSocket(page, 'wss://ws.test/', (message, send) => send(`echo:${message}`), { greeting: 'hello' });
    const received = await page.evaluate(
      () =>
        new Promise<string[]>((resolve) => {
          const socket = new WebSocket('wss://ws.test/');
          const got: string[] = [];
          socket.onmessage = (event) => {
            got.push(event.data);
            if (got.length === 1) socket.send('ping');
            if (got.length === 2) resolve(got);
          };
        }),
    );
    expect(received).toEqual(['hello', 'echo:ping']);
  });

  test('setOffline makes real requests fail, and back online they work', async ({ page, context }) => {
    await actions.goto(page, app.url);
    await network.setOffline(context, true);
    await actions.click(page.locator('#load'));
    await assertions.toHaveText(page.locator('#status'), 'failed');
    await network.setOffline(context, false);
    await actions.click(page.locator('#load'));
    await assertions.toHaveText(page.locator('#status'), 'loaded real');
  });

  test('setExtraHeaders adds headers to every request of the context', async ({ page, context }) => {
    await network.setExtraHeaders(context, { 'X-Feature': 'on' });
    await actions.goto(page, app.url);
    await actions.click(page.locator('#load'));
    await assertions.toHaveText(page.locator('#status'), 'loaded real');
    expect(app.lastItemsHeaders['x-feature']).toBe('on');
  });

  test('throttleNetwork (Chromium) adds latency to a real request', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'uses the DevTools protocol');
    await actions.goto(page, app.url);
    await network.throttleNetwork(page, { latencyMs: 600, downloadKbps: 500 });
    const started = Date.now();
    await actions.click(page.locator('#load'));
    await assertions.toHaveText(page.locator('#status'), 'loaded real');
    expect(Date.now() - started).toBeGreaterThanOrEqual(400);
  });
});

test.describe('trackNetwork', () => {
  test('records requests, failures and 4xx/5xx; find and expectNoErrors name each problem; waitUntilQuiet settles', async ({ page }) => {
    await page.route('**/pic.png', (route) => route.abort('connectionrefused'));
    await page.route(items, (route) => route.fulfill({ status: 500, body: 'boom' }));
    const log = network.trackNetwork(page);
    await actions.goto(page, app.url);
    await actions.click(page.locator('#load'));
    await assertions.toHaveText(page.locator('#status'), 'error 500');
    await log.waitUntilQuiet({ quietMs: 200 });
    expect(log.inFlight()).toBe(0);
    expect(log.find(items)).toHaveLength(1);
    expect(log.find(/pic\.png/)).toHaveLength(1);
    expect(log.find((url) => url.pathname === '/')).toHaveLength(1);
    expect(log.find(`${app.url}/pic.png`)).toHaveLength(1);
    expect(log.find('**/pic.png')).toHaveLength(1);
    expect(log.failures.map((f) => new URL(f.url).pathname)).toEqual(['/pic.png']);
    expect(log.errorResponses.map((r) => [new URL(r.url).pathname, r.status])).toEqual([['/api/items', 500]]);
    expect(() => log.expectNoErrors()).toThrow(/2 network problem\(s\):[\s\S]*pic\.png failed[\s\S]*-> 500/);
    expect(() => log.expectNoErrors({ ignore: [/pic\.png/], allowStatuses: [500] })).not.toThrow();
    log.stop();
  });
});

test.describe('trackNetwork.find string matching', () => {
  test('a string is the exact URL unless it has a *: a fragment no longer matches (it used to match any URL containing it)', async ({ page }) => {
    const log = network.trackNetwork(page);
    await actions.goto(page, app.url);
    await expect.poll(() => log.requests.length).toBeGreaterThan(0);
    expect(log.find('pic.png')).toHaveLength(0);
    expect(log.find(app.url)).toHaveLength(0); // the page itself is `${app.url}/`
    expect(log.find(`${app.url}/`)).toHaveLength(1);
    expect(log.find(`${app.url}/pic.*`)).toHaveLength(1);
    expect(log.find(/pic/)).toHaveLength(1);
    log.stop();
  });
});

test.describe('routeFromHar update', () => {
  test('recording warns about the credentials a HAR keeps, and sanitizeHar masks them', async ({ page }) => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'har-')), 'rec.har');
    fs.writeFileSync(
      file,
      JSON.stringify({
        log: {
          entries: [
            {
              request: {
                url: 'https://api.test/login',
                headers: [{ name: 'Authorization', value: 'Bearer abc.def.ghi' }, { name: 'Accept', value: 'application/json' }, { name: 'X-Api-Key', value: 'k-123' }],
                cookies: [{ name: 'sid', value: 'cookie-secret' }],
                postData: { mimeType: 'application/json', text: JSON.stringify({ user: 'ada', password: 'hunter2', nested: { token: 't-1' } }) },
              },
              response: { headers: [{ name: 'Set-Cookie', value: 'sid=cookie-secret' }, { name: 'Content-Type', value: 'text/plain' }], cookies: [{ name: 'sid', value: 'cookie-secret' }] },
            },
          ],
        },
      }),
    );
    const masked = network.sanitizeHar(file);
    expect(masked).toBeGreaterThanOrEqual(7);
    const text = fs.readFileSync(file, 'utf8');
    for (const secret of ['abc.def.ghi', 'k-123', 'cookie-secret', 'hunter2', 't-1']) expect(text).not.toContain(secret);
    expect(text).toContain('application/json'); // harmless headers and non-secret fields stay
    expect(JSON.parse(JSON.parse(text).log.entries[0].request.postData.text).user).toBe('ada');
    // recording into a HAR is announced: it keeps real headers
    const lines: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => (lines.push(String(chunk)), true)) as typeof process.stdout.write;
    try {
      await network.routeFromHar(page, path.join(path.dirname(file), 'new.har'), { update: true });
    } finally {
      process.stdout.write = original;
    }
    expect(lines.join('')).toMatch(/warn.*Recording real traffic into .*new\.har.*sanitizeHar/);
  });
});
