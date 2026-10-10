import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface NestedResult {
  title: string;
  status: 'passed' | 'failed' | 'skipped' | 'timedOut' | 'interrupted';
  errors: string[];
  attachments: string[];
  /** Every step the reporter saw (this package's and Playwright's own `Fill "..."` API steps), as `title | subtitle | params` - what an HTML / Allure / JUnit report would show. */
  steps: string[];
  /** What the test wrote to stdout - the logger's lines. */
  stdout: string;
}

// A reporter that records every step with its parameters: the JSON reporter does not list steps.
const STEP_REPORTER = `
const fs = require('fs');
class StepReporter {
  constructor() { this.steps = {}; }
  onStepBegin(test, result, step) {
    (this.steps[test.title] ??= []).push(step.title + ' | ' + (step.subtitle ?? '') + ' | ' + JSON.stringify(step.params ?? {}));
  }
  onEnd() { fs.writeFileSync('steps.json', JSON.stringify(this.steps)); }
}
module.exports = StepReporter;
`;

/** The built framework, for nested specs to import. `npm test` builds it first (pretest). */
export const FRAMEWORK = path.join(__dirname, '..', '..', 'dist', 'index.js');

/**
 * Runs Playwright on spec files written to a temp folder and returns what happened to each test - for behaviour that is
 * only visible when a test FAILS (a soft assertion collecting several failures, a fixture failing a test) and so cannot
 * be observed from inside the test that exercises it. Specs import the framework from `FRAMEWORK`.
 */
export function runPlaywright(specs: Record<string, string>, config = ''): NestedResult[] {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nested-pw-'));
  fs.writeFileSync(path.join(dir, 'playwright.config.js'), `module.exports = { testDir: '.', reporter: [['json'], ['./stepReporter.js']], workers: 1, timeout: 60000, retries: 0, outputDir: 'out', ${config} };`);
  fs.writeFileSync(path.join(dir, 'stepReporter.js'), STEP_REPORTER);
  for (const [name, source] of Object.entries(specs)) fs.writeFileSync(path.join(dir, name), source.replace(/__FRAMEWORK__/g, JSON.stringify(FRAMEWORK)));
  const cli = path.join(__dirname, '..', '..', 'node_modules', 'playwright', 'cli.js');
  const run = spawnSync(process.execPath, [cli, 'test', '--config', path.join(dir, 'playwright.config.js')], { cwd: dir, encoding: 'utf8', env: { ...process.env, LOG_TO_FILE: 'false', CI: '' } });
  let report: { suites: unknown[] };
  try {
    report = JSON.parse(run.stdout);
  } catch {
    throw new Error(`Nested Playwright run produced no JSON report.\nstdout: ${run.stdout.slice(0, 1500)}\nstderr: ${run.stderr.slice(0, 1500)}`);
  }
  const stepsByTest: Record<string, string[]> = fs.existsSync(path.join(dir, 'steps.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'steps.json'), 'utf8')) : {};
  const results: NestedResult[] = [];
  const walk = (suite: any) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests) {
        const last = t.results[t.results.length - 1];
        results.push({
          title: spec.title,
          status: last.status,
          // eslint-disable-next-line no-control-regex
          errors: (last.errors ?? []).map((e: { message: string }) => e.message.replace(/\u001b\[[0-9;]*m/g, '')),
          attachments: (last.attachments ?? []).map((a: { name: string }) => a.name),
          steps: stepsByTest[spec.title] ?? [],
          stdout: (last.stdout ?? []).map((chunk: { text?: string }) => chunk.text ?? '').join(''),
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites as any[]) walk(suite);
  return results;
}
