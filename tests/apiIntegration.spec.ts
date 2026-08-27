import * as http from 'node:http';
import type { Server } from 'node:http';
import { test, expect } from '@playwright/test';
import { MockServer, mockApiRoute } from '@automation/referenced-automation-api';
import { actions } from '../src';

/**
 * Demonstrates the two pieces of @automation/referenced-automation-api this
 * UI framework is meant to compose with:
 * - MockServer: a real backend for a page under test, when there's no real
 *   API to point at yet.
 * - mockApiRoute: overriding a page's runtime fetch at the browser level,
 *   no backend involved at all.
 *
 * api is a devDependency of this package only (see scripts/setup.sh) - it's
 * not part of what this package ships in dist/, only how its own tests
 * demonstrate composing with the sibling framework.
 */

const PROFILE_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>Profile</title></head>
<body>
  <div id="profile-name">loading...</div>
  <script>
    const target = new URLSearchParams(location.search).get('api');
    fetch(target)
      .then((res) => res.json())
      .then((profile) => { document.getElementById('profile-name').textContent = profile.name; });
  </script>
</body>
</html>`;

function startPageServer(): Promise<{ server: Server; baseUrl: string }> {
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url?.startsWith('/profile.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(PROFILE_HTML);
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

function stopPageServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

test.describe('using @automation/referenced-automation-api from a UI test @smoke', () => {
  test('MockServer provides a real backend for a page fetch, no real API needed', async ({ page }) => {
    const mockServer = new MockServer();
    await mockServer.start();
    // MockServer and the page server below are on different ports, so this
    // is a genuine cross-origin fetch from the page's script - without an
    // explicit CORS header the browser blocks the page from reading the
    // (successful) response, leaving the page stuck on "loading...".
    mockServer.get('/api/profile', { name: 'Ada Lovelace' }, { headers: { 'Access-Control-Allow-Origin': '*' } });

    const { server, baseUrl } = await startPageServer();
    try {
      const apiUrl = encodeURIComponent(`${mockServer.baseUrl}/api/profile`);
      await actions.goto(page, `${baseUrl}/profile.html?api=${apiUrl}`);
      await expect(page.locator('#profile-name')).toHaveText('Ada Lovelace');
    } finally {
      await stopPageServer(server);
      await mockServer.stop();
    }
  });

  test('mockApiRoute overrides the same fetch call at the browser level, no backend at all', async ({ page }) => {
    const { server, baseUrl } = await startPageServer();
    try {
      // A domain that can never resolve for real - proves the response
      // genuinely came from mockApiRoute, not a lucky real network hit.
      const apiUrl = encodeURIComponent('http://never-called.invalid/api/profile');
      await mockApiRoute(page, { url: '**/api/profile', method: 'GET', body: { name: 'Mocked Ada' } });

      await actions.goto(page, `${baseUrl}/profile.html?api=${apiUrl}`);
      await expect(page.locator('#profile-name')).toHaveText('Mocked Ada');
    } finally {
      await stopPageServer(server);
    }
  });
});
