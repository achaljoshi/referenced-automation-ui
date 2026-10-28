import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mergeTests } from '@playwright/test';
import { test as bddTest } from 'playwright-bdd';
import { MockServer } from '@automation/referenced-automation-api';
import { test as recordedTest } from '../../tests/support/recordedTest';
import { startAppServer, type AppServer } from '../../tests/support/appServer';
import { DEMO_PAGES, PROFILE_PAGE } from '../support/demoPages';

interface ScenarioServers {
  /** A real HTTP server with the sample app (a Load button that fetches /api/items) - for features about real network behaviour. Started only for scenarios that use it. */
  sampleApp: AppServer;
  /** A real backend for a page to call (no real API needed). Started only for scenarios that use it. */
  mockBackend: MockServer;
  /** A real server for the profile page; its origin differs from the mock backend's, so the page's fetch is cross-origin. */
  profileSite: { baseUrl: string };
}

/**
 * The test the Gherkin steps run in: this package's `test` (page, vars, uiScenario, correlation id, scenario banner ...),
 * here with https://app.test answered by the fixture page so the sample features run offline, and with the servers some
 * features need. In your own project use `import { test } from '@automation/referenced-automation-ui'` instead of
 * `recordedTest`, set BASE_URL, and the features open your real pages.
 */
// playwright-bdd needs its own `test` underneath; mergeTests combines it with the UI one.
export const test = mergeTests(bddTest, recordedTest).extend<ScenarioServers>({
  // https://app.test/demo/... are the small pages in features/support/demoPages.ts; everything else is the fixture page.
  context: async ({ context }, use) => {
    await context.route('https://app.test/demo/**', (route) => {
      const html = DEMO_PAGES[new URL(route.request().url()).pathname];
      return html === undefined ? route.fulfill({ status: 404, body: 'not found' }) : route.fulfill({ contentType: 'text/html', body: html });
    });
    await use(context);
  },

  sampleApp: async ({}, use) => {
    const app = await startAppServer();
    await use(app);
    await app.stop();
  },

  mockBackend: async ({}, use) => {
    const backend = new MockServer();
    await backend.start();
    await use(backend);
    await backend.stop();
  },

  profileSite: async ({}, use) => {
    const server = http.createServer((request, response) => {
      if (request.method === 'GET' && request.url?.startsWith('/profile.html')) {
        response.writeHead(200, { 'Content-Type': 'text/html' });
        response.end(PROFILE_PAGE);
        return;
      }
      response.writeHead(404);
      response.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    await use({ baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` });
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  },
});
