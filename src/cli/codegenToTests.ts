#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { convertCodegen, type ParamRule } from '../codegen';

const USAGE = `ui-codegen-to-playwright - turn a Playwright recording into a test written the way this framework is used

Record with Playwright's own tool, then convert:

  npx playwright codegen https://app.example.com --output recordings/login.spec.ts
  npx ui-codegen-to-playwright recordings/login.spec.ts

Usage:
  ui-codegen-to-playwright <recording.ts | folder | -> [options]

  Understands the "playwright-test" output (test('...', async ({ page }) => ...)) and the "library" one
  ((async () => { const browser = await chromium.launch(); ... })()).

Options:
  --out <file.ts|folder>   Where to write the spec(s). Default: tests/generated/<name>.spec.ts
  --stdout                 Print the converted test instead of writing a file.
  --test-import <module>   Module \`test\` comes from. Default: @automation/referenced-automation-ui.
                           Point it at your own base test (a relative path) to add your fixtures.
  --ui-import <module>     Module actions / assertions / locators ... come from. Default: @automation/referenced-automation-ui.
  --tag <tag>              Tag added to each test title. Default: @ui.
  --keep-host              Keep scheme and host in goto() URLs. Default: paths only, the host comes from BASE_URL.
  --param <regex>=<ENV_VAR>
                           Read the value typed into any field whose locator text matches from an environment variable
                           instead of writing it into the test. Repeatable. Passwords, tokens, secrets, PINs and API keys
                           are handled without this.
  --page-objects           Name every locator once in pages/<Name>Page.ts and use those in the test.
  --data                   Make every typed literal a column of <name>.data.csv and run one test per row.
  --name <text>            Base name for the test title, page object and data file. Default: the recording's file name.
  --strict                 Exit with an error if anything was kept as plain Playwright (TODO) or removed.
  -h, --help
`;

interface Options {
  input: string;
  out: string;
  stdout: boolean;
  testImport?: string;
  uiImport?: string;
  tag?: string;
  keepHost: boolean;
  params: ParamRule[];
  pageObjects: boolean;
  data: boolean;
  name?: string;
  strict: boolean;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { input: '', out: '', stdout: false, keepHost: false, params: [], pageObjects: false, data: false, strict: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    const value = () => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`${arg} needs a value`);
      return next;
    };
    if (arg === '-h' || arg === '--help') {
      process.stdout.write(USAGE);
      process.exit(0);
    } else if (arg === '--out') opts.out = value();
    else if (arg === '--stdout') opts.stdout = true;
    else if (arg === '--test-import') opts.testImport = value();
    else if (arg === '--ui-import') opts.uiImport = value();
    else if (arg === '--tag') opts.tag = value();
    else if (arg === '--keep-host') opts.keepHost = true;
    else if (arg === '--page-objects') opts.pageObjects = true;
    else if (arg === '--data') opts.data = true;
    else if (arg === '--name') opts.name = value();
    else if (arg === '--strict') opts.strict = true;
    else if (arg === '--param') {
      const spec = value();
      const eq = spec.lastIndexOf('=');
      if (eq < 1 || eq === spec.length - 1) throw new Error(`--param needs <regex>=<ENV_VAR>, got "${spec}"`);
      opts.params.push({ pattern: new RegExp(spec.slice(0, eq), 'i'), envVar: spec.slice(eq + 1) });
    } else if (arg.startsWith('-') && arg !== '-') throw new Error(`Unknown option ${arg} (see --help)`);
    else if (!opts.input) opts.input = arg;
    else throw new Error(`Unexpected argument ${arg}`);
  }
  if (!opts.input) throw new Error('Give a recording, a folder of them, or - for standard input (see --help)');
  return opts;
}

function inputs(input: string): Array<{ label: string; text: string; base: string }> {
  if (input === '-') return [{ label: 'standard input', text: fs.readFileSync(0, 'utf8'), base: 'recorded' }];
  const stat = fs.statSync(input);
  const files = stat.isDirectory()
    ? fs
        .readdirSync(input)
        .filter((f) => /\.(ts|js)$/.test(f) && !f.endsWith('.d.ts'))
        .sort()
        .map((f) => path.join(input, f))
    : [input];
  if (files.length === 0) throw new Error(`No .ts / .js recordings in ${input}`);
  return files.map((file) => ({
    label: file.split(path.sep).join('/'),
    text: fs.readFileSync(file, 'utf8'),
    base: path.basename(file).replace(/\.[^.]+$/, '').replace(/\.spec$/, ''),
  }));
}

function write(target: string, content: string): void {
  fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true });
  fs.writeFileSync(target, content);
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  const files = inputs(opts.input);
  let anyWarning = false;
  for (const file of files) {
    const outDir = opts.out.endsWith('.ts') ? path.dirname(opts.out) : opts.out || path.join('tests', 'generated');
    const specPath = opts.out.endsWith('.ts') && files.length === 1 ? opts.out : path.join(outDir, `${file.base}.spec.ts`);
    const result = convertCodegen(file.text, {
      source: file.label,
      testImport: opts.testImport,
      uiImport: opts.uiImport,
      tag: opts.tag,
      keepHost: opts.keepHost,
      params: opts.params,
      pageObjects: opts.pageObjects,
      data: opts.data,
      baseName: opts.name ?? file.base,
    });
    if (opts.stdout) {
      process.stdout.write(result.spec);
      if (result.pageObject) process.stdout.write(`\n// ---- ${result.pageObject.fileName} ----\n${result.pageObject.code}`);
      if (result.data) process.stdout.write(`\n// ---- ${result.data.fileName} ----\n${result.data.csv}`);
    } else {
      write(specPath, result.spec);
      process.stderr.write(`wrote ${specPath}  (${result.tests} test${result.tests === 1 ? '' : 's'})\n`);
      if (result.pageObject) {
        const pagePath = path.join(path.dirname(specPath), 'pages', result.pageObject.fileName);
        write(pagePath, result.pageObject.code);
        process.stderr.write(`wrote ${pagePath}\n`);
      }
      if (result.data) {
        const dataPath = path.join(path.dirname(specPath), result.data.fileName);
        write(dataPath, result.data.csv);
        process.stderr.write(`wrote ${dataPath}  (the recorded values are row 1: add rows to run more tests)\n`);
      }
    }
    for (const warning of result.warnings) process.stderr.write(`  note: ${warning}\n`);
    if (result.todos > 0) process.stderr.write(`  ${result.todos} statement(s) kept as plain Playwright, marked TODO(converter)\n`);
    if (result.envVars.length > 0) process.stderr.write(`  set these environment variables: ${result.envVars.join(', ')}\n`);
    if (!opts.keepHost && result.origins.length > 0) process.stderr.write(`  BASE_URL should be ${result.origins[0]}\n`);
    if (result.warnings.length > 0 || result.todos > 0) anyWarning = true;
  }
  if (opts.strict && anyWarning) {
    process.stderr.write('--strict: something was kept as plain Playwright or removed (see above)\n');
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
