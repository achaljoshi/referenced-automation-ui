import * as fs from 'node:fs';
import * as path from 'node:path';
import { test as base } from '../../src/fixtures/uiFixtures';

// The made-up login the fixture page accepts. Real projects set UI_PASSWORD from .env.<ENV>.local or a CI variable.
process.env.UI_PASSWORD ??= 'secret';

const PAGE = fs.readFileSync(path.join(__dirname, 'fixture.html'), 'utf8');

/**
 * The base test for the tests converted from recordings/*.spec.ts: the framework's own `test`, with the recorded site
 * (https://app.test/) answered by the fixture page, so the converted tests run offline. In a real project you do not
 * need this: the recording's host is BASE_URL, and the site is the real one.
 */
export const test = base.extend({
  baseURL: async ({}, use) => {
    await use('https://app.test');
  },
  context: async ({ context }, use) => {
    await context.route('https://app.test/**', (route) => route.fulfill({ contentType: 'text/html', body: PAGE }));
    await use(context);
  },
});
