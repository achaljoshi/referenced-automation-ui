import { spawnSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { logScenarioEnd, logScenarioStart } from '../src/fixtures/uiFixtures';

function captured(action: () => void): string {
  const lines: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array) => (lines.push(String(chunk)), true)) as typeof process.stdout.write;
  try {
    action();
  } finally {
    process.stdout.write = original;
  }
  return lines.join('');
}

test.describe('scenario banner', () => {
  test('opens with the title, file and tags', () => {
    const out = captured(() => logScenarioStart({ title: 'places an order', file: '/tests/order.spec.ts', tags: ['@smoke', '@e2e'] }));
    expect(out).toContain('SCENARIO START : places an order');
    expect(out).toContain('FILE           : /tests/order.spec.ts');
    expect(out).toContain('TAGS           : @smoke, @e2e');
    expect(out).toContain('CORRELATION');
  });

  test('closes with PASSED and the duration when the outcome is what was expected', () => {
    const out = captured(() => logScenarioEnd({ title: 'ok', status: 'passed', expectedStatus: 'passed', duration: 120 }));
    expect(out).toContain('SCENARIO PASSED  : ok (120ms)');
  });

  test('closes with FAILED when it was not (and test.fail() counts as passed when it does fail)', () => {
    expect(captured(() => logScenarioEnd({ title: 'bad', status: 'failed', expectedStatus: 'passed', duration: 5 }))).toContain('SCENARIO FAILED  : bad (5ms)');
    expect(captured(() => logScenarioEnd({ title: 'expected failure', status: 'failed', expectedStatus: 'failed', duration: 5 }))).toContain('SCENARIO PASSED  : expected failure');
  });
});

test.describe('importing the fixtures has no side effects', () => {
  test('no module-level hooks: the module can be loaded outside a test run (what bddgen and other tools do)', () => {
    const result = spawnSync(process.execPath, ['-e', "require('./dist/fixtures/uiFixtures'); console.log('loaded')"], { encoding: 'utf8', cwd: process.cwd() });
    expect(result.stdout).toContain('loaded');
    expect(result.stderr).not.toContain('did not expect test.beforeEach');
  });
});
