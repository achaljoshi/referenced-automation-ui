import * as http from 'node:http';
import type { AddressInfo } from 'node:net';

export const APP_PAGE = `
<button id="load" onclick="load()">Load</button>
<ul id="items"></ul><span id="status"></span><img id="pic" src="/pic.png" alt="pic">
<script>
  async function load() {
    document.getElementById('status').textContent = 'loading';
    try {
      const response = await fetch('/api/items?page=1', { headers: { 'X-Client': 'test' } });
      if (!response.ok) { document.getElementById('status').textContent = 'error ' + response.status; return; }
      const data = await response.json();
      document.getElementById('items').innerHTML = data.items.map(i => '<li>' + i + '</li>').join('');
      document.getElementById('status').textContent = 'loaded ' + (data.source || '');
    } catch (e) { document.getElementById('status').textContent = 'failed'; }
  }
</script>
`;

const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

export interface AppServer {
  url: string;
  /** What /api/items answers with as `source` - change it to prove a replay is not hitting the server. */
  state: { source: string };
  /** Headers of the last request to /api/items, lower-cased. */
  lastItemsHeaders: Record<string, string | string[] | undefined>;
  stop(): Promise<void>;
}

/** A real HTTP server for the tests whose subject is real network behaviour (modify a real response, go offline, throttle, record a HAR) - routes cannot stand in for those. */
export function startAppServer(): Promise<AppServer> {
  const state = { source: 'real' };
  const handle: AppServer = { url: '', state, lastItemsHeaders: {}, stop: () => new Promise((resolve) => server.close(() => resolve())) };
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname === '/') {
      response.setHeader('Content-Type', 'text/html');
      response.end(APP_PAGE);
    } else if (url.pathname === '/api/items') {
      handle.lastItemsHeaders = request.headers;
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ items: ['a', 'b'], source: state.source }));
    } else if (url.pathname === '/report') {
      response.setHeader('Content-Disposition', 'attachment; filename="report.json"');
      response.setHeader('Content-Type', 'application/json');
      response.end('{"total":3}');
    } else if (url.pathname === '/pic.png') {
      response.setHeader('Content-Type', 'image/png');
      response.end(PIXEL);
    } else {
      response.statusCode = 404;
      response.end('not found');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      handle.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve(handle);
    });
  });
}
