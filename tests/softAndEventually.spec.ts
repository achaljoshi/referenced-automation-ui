import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test, expect } from '../src/fixtures/uiFixtures';
import * as actions from '../src/actions';
import * as assertions from '../src/assertions';
import { servePage } from './support/servePage';
import { startAppServer, type AppServer } from './support/appServer';
import { runPlaywright } from './support/runPlaywright';

test.describe('softly (nested runs: what matters is how a FAILING test reports)', () => {
  const SPEC = `
    const { test, assertions } = require(__FRAMEWORK__);
    const html = '<h1 id="h">Real title</h1><p id="p">Real paragraph</p><span id="s">Real span</span>';
    const open = (page) => page.route('https://app.test/', r => r.fulfill({ contentType: 'text/html', body: html })).then(() => page.goto('https://app.test/'));
    const opts = { timeout: 300 };

    test('hard stops at the first failure', async ({ page }) => {
      await open(page);
      await assertions.toHaveText(page.locator('#h'), 'Wrong 1', opts);
      await assertions.toHaveText(page.locator('#p'), 'Wrong 2', opts);
    });

    test('softly reports all of them and carries on', async ({ page }) => {
      await open(page);
      await assertions.softly(async () => {
        await assertions.toHaveText(page.locator('#h'), 'Wrong 1', opts);
        await assertions.toHaveText(page.locator('#p'), 'Wrong 2', opts);
        await assertions.toHaveText(page.locator('#s'), 'Real span', opts);
      });
      require('fs').writeFileSync(process.env.REACHED_MARKER, 'reached');
    });

    test('softly returns the block value and a passing block is just a passing test', async ({ page }) => {
      await open(page);
      const value = await assertions.softly(async () => { await assertions.toHaveText(page.locator('#h'), 'Real title'); return 42; });
      if (value !== 42) throw new Error('softly lost the return value');
    });

    test('the soft scope ends with the block: later assertions are hard again', async ({ page }) => {
      await open(page);
      await assertions.softly(async () => { await assertions.toHaveText(page.locator('#h'), 'Real title'); });
      await assertions.toHaveText(page.locator('#h'), 'Wrong after', opts);
      require('fs').writeFileSync(process.env.SHOULD_NOT_EXIST, 'oops');
    });
  `;

  test('hard assertions stop at the first failure; softly collects every one and the test continues; the scope does not leak', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'soft-'));
    const reached = path.join(dir, 'reached');
    const shouldNot = path.join(dir, 'should-not-exist');
    process.env.REACHED_MARKER = reached;
    process.env.SHOULD_NOT_EXIST = shouldNot;
    const results = Object.fromEntries(runPlaywright({ 'soft.spec.js': SPEC }).map((r) => [r.title, r]));
    delete process.env.REACHED_MARKER;
    delete process.env.SHOULD_NOT_EXIST;

    expect(results['hard stops at the first failure']?.status).toBe('failed');
    expect(results['hard stops at the first failure']?.errors).toHaveLength(1);

    const soft = results['softly reports all of them and carries on'];
    expect(soft?.status).toBe('failed');
    expect(soft?.errors).toHaveLength(2);
    expect(soft?.errors.join('\n')).toMatch(/Wrong 1[\s\S]*Wrong 2/);
    expect(fs.existsSync(reached)).toBe(true); // the code after the failing soft assertions ran

    expect(results['softly returns the block value and a passing block is just a passing test']?.status).toBe('passed');
    expect(results['the soft scope ends with the block: later assertions are hard again']?.status).toBe('failed');
    expect(fs.existsSync(shouldNot)).toBe(false); // the hard assertion after the block stopped the test
  });
});

test.describe('eventually and pollValue', () => {
  test('eventually retries the whole block until it passes', async ({ page }) => {
    await servePage(page, '<ul id="rows"></ul><span id="total">$0</span><script>let n=0;const t=setInterval(()=>{n++;rows.insertAdjacentHTML("beforeend","<li>r</li>");total.textContent="$"+n*10;if(n==3)clearInterval(t)},150)</script>');
    await assertions.eventually(async () => {
      expect(await actions.count(page.locator('#rows li'), { timeout: 0 })).toBe(3);
      expect(await actions.getText(page.locator('#total'))).toBe('$30');
    });
  });

  test('eventually gives up with the block\'s last failure', async () => {
    await expect(
      assertions.eventually(async () => {
        expect(1, 'the number should be 2').toBe(2);
      }, { timeout: 600, intervals: [50] }),
    ).rejects.toThrow(/the number should be 2/);
  });

  test('pollValue waits for a value to become what is expected (deep equality)', async () => {
    const started = Date.now();
    await assertions.pollValue(() => (Date.now() - started > 300 ? { state: 'SHIPPED', items: [1, 2] } : { state: 'PENDING', items: [] }), { state: 'SHIPPED', items: [1, 2] }, { intervals: [50] });
    await expect(assertions.pollValue(() => 'PENDING', 'SHIPPED', { timeout: 300, intervals: [50], message: 'order never shipped' })).rejects.toThrow(/order never shipped/);
  });
});

test.describe('download reading', () => {
  // A download must come from a real server: Chromium cancels one answered by route.fulfill (and loses its file name).
  let app: AppServer;
  test.beforeAll(async () => {
    app = await startAppServer();
  });
  test.afterAll(async () => {
    await app.stop();
  });

  test('downloadAndRead saves the file, names it as the server did, and reads it as text, json or bytes', async ({ page }) => {
    await page.goto(app.url);
    await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<a id="d" href="/report" download>Download</a>'));
    const dir = path.join(os.tmpdir(), `dl-${Date.now()}`);
    const file = await actions.downloadAndRead(page, () => actions.click(page.locator('#d')), dir);
    expect(file.fileName).toBe('report.json');
    expect(file.path).toBe(path.join(dir, 'report.json'));
    expect(await file.text()).toBe('{"total":3}');
    expect(await file.json<{ total: number }>()).toEqual({ total: 3 });
    expect((await file.bytes()).length).toBe(11);
  });
});
