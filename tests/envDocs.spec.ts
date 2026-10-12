import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import { convertCodegen } from '../src/codegen';

// Drift guard for the configuration documentation (.env.example, .env.local.example and the README "Configuration
// reference"): every variable the code reads is documented, nothing is documented that nothing reads, every entry carries
// the same metadata lines, the README table says the same as the file, and the secret template covers every secret.
// It reads files only - no browser. The extractors are exported so the negative controls at the bottom can prove they
// report a gap (a check that cannot fail would be worth nothing).

const root = path.resolve(__dirname, '..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative: string) => fs.existsSync(path.join(root, relative));
const filesUnder = (dir: string, extension: RegExp): string[] =>
  !exists(dir)
    ? []
    : fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
        const relative = path.posix.join(dir, entry.name);
        return entry.isDirectory() ? filesUnder(relative, extension) : extension.test(entry.name) ? [relative] : [];
      });

const NAME = /^[A-Z][A-Z0-9_]*$/;
const ENV_READERS = new Set(['get', 'getOptional', 'getInt', 'getBoolean', 'getList', 'has']);
/** The receivers of an `.get('X')` call that mean "the loaded environment": `env`, `this` (the reader itself), `loadEnv()`. */
const isEnvReader = (receiver: string) => /^(env|this|this\.env|loadEnv\([^)]*\))$/.test(receiver);

export interface EnvReads {
  /** Read through loadEnv(): a .env file or the real environment can supply it. */
  loadEnv: Set<string>;
  /** Read straight from process.env (or a script): only the real environment can supply it. */
  processEnv: Set<string>;
}

/** The variables a TypeScript / JavaScript source reads: env.get*('X'), process.env.X, process.env['X'], baseUrlKey: 'X'. Comments and strings that merely mention a name do not count. */
export function envReadsInCode(source: string, fileName = 'source.ts'): EnvReads {
  const reads: EnvReads = { loadEnv: new Set(), processEnv: new Set() };
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, fileName.endsWith('.js') ? ts.ScriptKind.JS : ts.ScriptKind.TS);
  const literal = (node: ts.Node | undefined): string | undefined => (node && ts.isStringLiteralLike(node) && NAME.test(node.text) ? node.text : undefined);
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ENV_READERS.has(node.expression.name.text) && isEnvReader(node.expression.expression.getText(sf))) {
      const name = literal(node.arguments[0]);
      if (name) reads.loadEnv.add(name);
    }
    if (ts.isPropertyAccessExpression(node) && node.expression.getText(sf) === 'process.env' && NAME.test(node.name.text)) reads.processEnv.add(node.name.text);
    if (ts.isElementAccessExpression(node) && node.expression.getText(sf) === 'process.env') {
      const name = literal(node.argumentExpression);
      if (name) reads.processEnv.add(name);
    }
    // createPlaywrightConfig({ baseUrlKey: 'BASE_URL' }) and its own default: `options.baseUrlKey ?? 'BASE_URL'`
    if (ts.isPropertyAssignment(node) && node.name.getText(sf) === 'baseUrlKey') {
      const name = literal(node.initializer);
      if (name) reads.loadEnv.add(name);
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken && node.left.getText(sf).endsWith('baseUrlKey')) {
      const name = literal(node.right);
      if (name) reads.loadEnv.add(name);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return reads;
}

/** Windows variables a .bat file reads that nobody sets in it, and that are not configuration. */
const SYSTEM_VARIABLES = new Set(['ERRORLEVEL', 'RANDOM', 'TEMP', 'TMP', 'CD', 'DATE', 'TIME', 'PATH', 'HOME', 'PWD', 'USER', 'USERPROFILE']);

/** The environment variables a script or pipeline file reads (not the ones it assigns itself, not system variables, not GitLab's predefined CI_*). */
export function envReadsInShell(source: string, kind: 'sh' | 'bat' | 'yml'): Set<string> {
  const reads = new Set<string>();
  if (kind === 'bat') {
    const text = source.split('\n').filter((line) => !/^\s*(REM\b|::)/i.test(line)).join('\n');
    const assigned = new Set([...text.matchAll(/\bset\s+"?([A-Za-z][A-Za-z0-9_]*)=/gi)].map((m) => (m[1] as string).toUpperCase()));
    for (const m of [...text.matchAll(/%([A-Z][A-Z0-9_]*)%/g), ...text.matchAll(/\bdefined\s+([A-Z][A-Z0-9_]*)/gi)]) {
      const name = (m[1] as string).toUpperCase();
      if (!assigned.has(name) && !SYSTEM_VARIABLES.has(name)) reads.add(name);
    }
    return reads;
  }
  const text = source.split('\n').filter((line) => !line.trim().startsWith('#')).join('\n');
  const assigned = new Set([...text.matchAll(/^\s*(?:export\s+|local\s+|readonly\s+)?([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1] as string));
  for (const m of [...text.matchAll(/\$\{([A-Z][A-Z0-9_]*)(?=[:}#%/+\-=?])/g), ...text.matchAll(/\$([A-Z][A-Z0-9_]+)\b/g), ...text.matchAll(/\bexport\s+([A-Z][A-Z0-9_]*)\s*$/gm)]) {
    const name = m[1] as string;
    if (kind === 'sh' ? !assigned.has(name) && !SYSTEM_VARIABLES.has(name) : !name.startsWith('CI_')) reads.add(name);
  }
  return reads;
}

export interface Entry {
  name: string;
  /** The comment lines directly above the variable line. */
  block: string;
  secret: boolean;
  readFrom: string;
}

/** The documented variables of a .env.example text: the commented `# NAME=...` lines with the comment block above each. */
export function documentedVariables(text: string): Entry[] {
  const lines = text.split('\n');
  const entries: Entry[] = [];
  lines.forEach((line, index) => {
    const match = /^# ([A-Z][A-Z0-9_]*)=/.exec(line);
    if (!match) return;
    const block: string[] = [];
    for (let i = index - 1; i >= 0 && (lines[i] as string).startsWith('#'); i--) block.unshift(lines[i] as string);
    const joined = block.join('\n');
    entries.push({ name: match[1] as string, block: joined, secret: /\| Secret: YES\b/.test(joined), readFrom: /^# Read from: (.*)$/m.exec(joined)?.[1] ?? '' });
  });
  return entries;
}

/** Entries that lack a description or one of the metadata lines. */
export function missingMetadata(entries: Entry[]): string[] {
  const required: Array<[string, RegExp]> = [
    ['Read from:', /^# Read from: \S/m],
    ['Values:', /^# Values: \S/m],
    ['Default:', /^# Default: .+/m],
    ['Required:', /^# Default: .*\| Required: \S/m],
    ['Secret:', /^# Default: .*\| Secret: (no|YES)\b/m],
    ['Example:', /^# Example[^:\n]*: \S/m],
  ];
  const problems: string[] = [];
  for (const entry of entries) {
    if (!entry.block.split('\n').some((line) => !/^# (Read from|Values|Default|Example[^:]*):/.test(line) && /^# \S/.test(line))) problems.push(`${entry.name}: no description line`);
    for (const [label, pattern] of required) if (!pattern.test(entry.block)) problems.push(`${entry.name}: no "${label}" line`);
  }
  return problems;
}

/** Names that appear in `wanted` but not in `documented`. */
export const missingFrom = (wanted: Iterable<string>, documented: Iterable<string>): string[] => {
  const have = new Set(documented);
  return [...new Set(wanted)].filter((name) => !have.has(name)).sort();
};

/** Rows of the README "Configuration reference" tables: `| \`NAME\` | purpose | default | required | secret |`. */
export function referenceTableRows(readme: string): Array<{ name: string; secret: string; cells: number }> {
  const start = readme.indexOf('\n## Configuration reference');
  if (start < 0) return [];
  const rest = readme.slice(start + 1);
  const end = rest.indexOf('\n## ', 3);
  const section = end < 0 ? rest : rest.slice(0, end);
  return section
    .split('\n')
    .map((line) => ({ line, match: /^\| `([A-Z][A-Z0-9_]*)` \|/.exec(line) }))
    .filter((row) => row.match)
    .map(({ line, match }) => {
      const cells = line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/);
      return { name: (match as RegExpExecArray)[1] as string, secret: (cells[4] ?? '').trim(), cells: cells.length };
    });
}

/** Differences between the README table and the documented entries: names in only one of them, duplicates, a Secret column that disagrees. */
export function tableProblems(rows: Array<{ name: string; secret: string; cells: number }>, entries: Entry[]): string[] {
  const problems: string[] = [];
  const names = rows.map((r) => r.name);
  for (const name of missingFrom(entries.map((e) => e.name), names)) problems.push(`README table has no row for ${name}`);
  for (const name of missingFrom(names, entries.map((e) => e.name))) problems.push(`README table lists ${name}, which .env.example does not`);
  for (const name of names.filter((n, i) => names.indexOf(n) !== i)) problems.push(`README table lists ${name} twice`);
  for (const row of rows) {
    if (row.cells !== 5) problems.push(`${row.name}: the row has ${row.cells} cells, expected 5 (Name, Purpose, Default, Required, Secret)`);
    const entry = entries.find((e) => e.name === row.name);
    if (entry && (row.secret === 'YES') !== entry.secret) problems.push(`${row.name}: README Secret column says "${row.secret}", .env.example says ${entry.secret ? 'YES' : 'no'}`);
    if (entry && row.secret !== 'YES' && row.secret !== 'no') problems.push(`${row.name}: README Secret column must be "YES" or "no", got "${row.secret}"`);
  }
  return problems;
}

/** Problems with a .env.local.example: a secret without an entry, an entry that is not a secret, a value that looks real instead of a "<placeholder>". */
export function localExampleProblems(text: string, entries: Entry[]): string[] {
  const problems: string[] = [];
  const secrets = entries.filter((e) => e.secret).map((e) => e.name);
  const listed = [...text.matchAll(/^#? ?([A-Z][A-Z0-9_]*)=(.*)$/gm)].map((m) => ({ name: m[1] as string, value: (m[2] as string).trim() }));
  for (const name of missingFrom(secrets, listed.map((l) => l.name))) problems.push(`.env.local.example has no entry for the secret ${name}`);
  for (const { name, value } of listed) {
    if (!secrets.includes(name)) problems.push(`.env.local.example lists ${name}, which .env.example does not mark Secret: YES`);
    if (value !== '' && !/^"<[a-z0-9][a-z0-9 -]*>"$/.test(value)) problems.push(`${name}: the value must be a double-quoted <placeholder>, not a real-looking value`);
  }
  return problems;
}

/** Entries whose "Read from" contradicts how the code reads them. */
export function readFromProblems(entries: Entry[], viaLoadEnv: Set<string>, realOnly: Set<string>): string[] {
  const problems: string[] = [];
  for (const entry of entries) {
    const saysRealOnly = /^the real environment only/i.test(entry.readFrom);
    if (viaLoadEnv.has(entry.name) && saysRealOnly) problems.push(`${entry.name}: read through loadEnv(), but "Read from" says the real environment only`);
    if (!viaLoadEnv.has(entry.name) && realOnly.has(entry.name) && !saysRealOnly) problems.push(`${entry.name}: read only from the real environment, but "Read from" says "${entry.readFrom}"`);
  }
  return problems;
}

/** Internal links (`](#anchor)`) of a Markdown text that point at no heading (GitHub's slug rules). */
export function brokenAnchors(markdown: string): string[] {
  const slug = (heading: string) =>
    heading
      .replace(/`/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9 _-]/g, '')
      .trim()
      .replace(/ /g, '-');
  const slugs = new Set(markdown.split('\n').filter((l) => /^#{1,6} /.test(l)).map((l) => slug(l.replace(/^#+ /, ''))));
  return [...new Set([...markdown.matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1] as string))].filter((anchor) => !slugs.has(anchor)).sort();
}

const TIP_TITLE = 'TIP - quoting values (dotenv rules)';
export const countOccurrences = (text: string, needle: string) => text.split(needle).length - 1;

// ---- what the code reads, computed once ---------------------------------------------------------------------------

const utilsDist = path.join(path.dirname(require.resolve('@automation/referenced-automation-utils')));
const readDist = (relative: string) => fs.readFileSync(path.join(utilsDist, relative), 'utf8');
const distFiles = (dir = ''): string[] =>
  fs.readdirSync(path.join(utilsDist, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(dir, entry.name);
    return entry.isDirectory() ? distFiles(relative) : entry.name.endsWith('.js') ? [relative] : [];
  });

/** Computes a value on first use and keeps it (parsing the whole utils package once is enough for every test). */
const once = <T>(compute: () => T): (() => T) => {
  let value: T | undefined;
  return () => (value ??= compute());
};

/** The keys createPlaywrightConfig, the logger, the random utilities and loadEnv read - from the BUILT utils package this repo runs. */
const sharedKeys = once((): EnvReads => {
  const merged: EnvReads = { loadEnv: new Set(), processEnv: new Set() };
  for (const file of ['playwright/config.js', 'logger/logger.js', 'random/randomUtils.js', 'config/env.js']) {
    const reads = envReadsInCode(readDist(file), file);
    // env.js: ENV / ENVIRONMENT choose the file, so they are real-environment only whatever env.get('ENV') answers afterwards
    if (file !== 'config/env.js') reads.loadEnv.forEach((n) => merged.loadEnv.add(n));
    reads.processEnv.forEach((n) => merged.processEnv.add(n));
  }
  return merged;
});

/** Everything any utils module reads (the REMOTE_*, mainframe ... keys too): a documented key may be read there. */
const everythingUtilsReads = once((): Set<string> => {
  const all = new Set<string>();
  for (const file of distFiles()) {
    const reads = envReadsInCode(readDist(file), file);
    reads.loadEnv.forEach((n) => all.add(n));
    reads.processEnv.forEach((n) => all.add(n));
  }
  return all;
});

const CODE_DIRS = ['src', 'tests/support', 'tests/generated', 'features/steps'];
const repoReads = once((): EnvReads & { shell: Set<string> } => {
  const reads = { loadEnv: new Set<string>(), processEnv: new Set<string>(), shell: new Set<string>() };
  const codeFiles = [...CODE_DIRS.flatMap((dir) => filesUnder(dir, /\.ts$/)), 'playwright.config.ts'];
  for (const file of codeFiles) {
    const found = envReadsInCode(read(file), file);
    found.loadEnv.forEach((n) => reads.loadEnv.add(n));
    found.processEnv.forEach((n) => reads.processEnv.add(n));
  }
  for (const file of filesUnder('scripts', /\.(sh|bat)$/)) envReadsInShell(read(file), file.endsWith('.bat') ? 'bat' : 'sh').forEach((n) => reads.shell.add(n));
  if (exists('.gitlab-ci.yml')) envReadsInShell(read('.gitlab-ci.yml'), 'yml').forEach((n) => reads.shell.add(n));
  return reads;
});

/** A recording that holds every kind of credential with a FIXED variable name; the converter's own answer says which names it writes. */
const converterVariables = once((): string[] => {
  const join = (...parts: string[]) => parts.join('');
  const recording = [
    "import { test } from '@playwright/test';",
    "test('probe', async ({ page }) => {",
    "  await page.getByLabel('Password').fill('typed-value');",
    `  await page.setExtraHTTPHeaders({ 'x-a': '${join('Bearer', ' ', 'abcdef', '123456')}' });`,
    `  await page.setExtraHTTPHeaders({ 'x-b': '${join('Basic', ' ', 'dXNlcjpwYXNz', 'd29yZA==')}' });`,
    `  await page.setExtraHTTPHeaders({ 'x-c': '${join('eyJhbGciOiJIUzI1NiJ9', '.', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', '.', 'abcdef123456')}' });`,
    '});',
  ].join('\n');
  return convertCodegen(recording, { source: 'probe.spec.ts' }).envVars;
});

/** Keys that are documented although no code of this repo or the utils package reads them, each with the reason. */
const PASS_THROUGH: Record<string, string> = {
  TZ: 'read by Node itself (Date, Intl), from the real environment only - no code here or in utils mentions it',
};

const documented = documentedVariables(read('.env.example'));
const documentedNames = documented.map((e) => e.name);

test.describe('.env.example is the complete, consistent configuration reference', () => {
  test('the extractors find a sensible number of keys in every source (so a check cannot pass by finding nothing)', () => {
    const shared = sharedKeys();
    const sharedAll = new Set([...shared.loadEnv, ...shared.processEnv]);
    expect(sharedAll.size, 'shared keys found in the built utils package').toBeGreaterThanOrEqual(30);
    for (const name of ['BROWSER', 'HEADLESS', 'BASE_URL', 'WORKERS', 'RETRIES', 'TEST_TIMEOUT_MS', 'TEST_ID_ATTRIBUTE', 'LOG_LEVEL', 'LOG_FILE', 'RANDOM_SEED', 'ENV', 'ENVIRONMENT', 'CI', 'TEST_WORKER_INDEX', 'NO_COLOR', 'FORCE_COLOR'])
      expect(sharedAll, `${name} is read by the shared utils code`).toContain(name);
    const repo = repoReads();
    const repoAll = new Set([...repo.loadEnv, ...repo.processEnv, ...repo.shell]);
    expect(repoAll.size, 'keys this repo reads itself').toBeGreaterThanOrEqual(6);
    for (const name of ['BASE_URL', 'UI_PASSWORD', 'NPM_REGISTRY_URL', 'USE_LOCAL_PACKAGES', 'PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD', 'PLAYWRIGHT_DOWNLOAD_HOST', 'AUDIT_RUN_GATES'])
      expect(repoAll, `${name} is read by this repo`).toContain(name);
    expect(documentedNames.length, 'variables documented in .env.example').toBeGreaterThanOrEqual(40);
    expect(new Set(documentedNames).size, 'a variable is documented twice').toBe(documentedNames.length);
    expect(everythingUtilsReads().size, 'keys the whole utils package reads').toBeGreaterThan(sharedAll.size);
    expect(converterVariables(), 'the converter probe finds the fixed credential names').toEqual(expect.arrayContaining(['UI_PASSWORD', 'UI_BEARER_TOKEN', 'UI_BASIC_CREDENTIAL', 'UI_JWT']));
  });

  test('every variable this repo reads itself is documented', () => {
    const repo = repoReads();
    expect(missingFrom([...repo.loadEnv, ...repo.processEnv, ...repo.shell], documentedNames), 'read by src/, playwright.config.ts, scripts/, tests/support, tests/generated, features/steps or .gitlab-ci.yml but missing from .env.example').toEqual([]);
  });

  test('every shared key createPlaywrightConfig, the logger, randomUtils and loadEnv read is documented', () => {
    const shared = sharedKeys();
    expect(missingFrom([...shared.loadEnv, ...shared.processEnv], documentedNames), 'read by the built utils package but missing from .env.example').toEqual([]);
  });

  test('every key the converter writes with a fixed name is documented, and nothing is documented that nothing reads', () => {
    const converter = converterVariables();
    expect(missingFrom(converter, documentedNames), 'written by the converter but missing from .env.example').toEqual([]);
    const repo = repoReads();
    const shared = sharedKeys();
    const readSomewhere = new Set([...repo.loadEnv, ...repo.processEnv, ...repo.shell, ...shared.loadEnv, ...shared.processEnv, ...everythingUtilsReads(), ...converter, ...Object.keys(PASS_THROUGH)]);
    expect(missingFrom(documentedNames, readSomewhere), 'documented but read by no code (add it to PASS_THROUGH with a reason only if something outside the code reads it)').toEqual([]);
  });

  test('the pass-through list is not stale: each entry is documented, has a reason, and is read by no code', () => {
    const repo = repoReads();
    const code = new Set([...repo.loadEnv, ...repo.processEnv, ...repo.shell, ...everythingUtilsReads(), ...converterVariables()]);
    for (const [name, reason] of Object.entries(PASS_THROUGH)) {
      expect(documentedNames, `${name} is in PASS_THROUGH but not documented`).toContain(name);
      expect(reason.length, `${name} needs a reason`).toBeGreaterThan(20);
      expect(code, `${name} is read by code, so it does not belong in PASS_THROUGH`).not.toContain(name);
    }
  });

  test('every entry has a description and the Read from / Values / Default / Required / Secret / Example lines', () => {
    expect(missingMetadata(documented)).toEqual([]);
  });

  test('"Read from" agrees with the code: loadEnv keys can come from a .env file, process.env / script keys cannot', () => {
    const repo = repoReads();
    const shared = sharedKeys();
    const viaLoadEnv = new Set([...repo.loadEnv, ...shared.loadEnv, ...converterVariables()]);
    const realOnly = new Set([...repo.processEnv, ...repo.shell, ...shared.processEnv, ...Object.keys(PASS_THROUGH)]);
    expect(readFromProblems(documented, viaLoadEnv, realOnly)).toEqual([]);
    // the claim the header makes, spelled out for the ones people trip over
    for (const name of ['LOG_LEVEL', 'LOG_TO_FILE', 'LOG_FILE', 'LOG_FILE_PER_WORKER', 'NO_COLOR', 'FORCE_COLOR', 'RANDOM_SEED', 'CI', 'TZ', 'ENV', 'ENVIRONMENT', 'NPM_REGISTRY_URL'])
      expect(documented.find((e) => e.name === name)?.readFrom, `${name} is real environment only`).toMatch(/^the real environment only/i);
    for (const name of ['BROWSER', 'HEADLESS', 'BASE_URL', 'WORKERS', 'UI_PASSWORD'])
      expect(documented.find((e) => e.name === name)?.readFrom, `${name} may come from a .env file`).toMatch(/^\.env files or the real environment/);
  });

  test('the quoting tip appears exactly once, and the header explains the secret file name and the three shells', () => {
    const text = read('.env.example');
    expect(countOccurrences(text, TIP_TITLE)).toBe(1);
    expect(text).toContain('.env.<ENV>.local');
    expect(text).toContain('NOT .env.local');
    for (const shell of ['bash / zsh :', 'PowerShell :', 'cmd.exe    :']) expect(text, shell).toContain(shell);
    expect(text).toContain('Copy-Item .env.local.example');
  });
});

test.describe('README "Configuration reference" matches .env.example', () => {
  const readme = read('README.md');

  test('the table lists exactly the documented variables, with the same Secret marks', () => {
    const rows = referenceTableRows(readme);
    expect(rows.length, 'rows found in the README table').toBeGreaterThanOrEqual(40);
    expect(tableProblems(rows, documented)).toEqual([]);
    expect(rows.filter((r) => r.secret === 'YES').map((r) => r.name).sort(), 'secret rows').toEqual(documented.filter((e) => e.secret).map((e) => e.name).sort());
  });

  test('the section says which keys are shared and which are repo-specific, and links the utils documentation', () => {
    const section = readme.slice(readme.indexOf('## Configuration reference'));
    expect(section).toContain('Shared keys');
    expect(section).toContain('Repo-specific keys');
    expect(section).toContain('referenced-automation-utils/blob/master/.env.example');
    expect(section).toContain('referenced-automation-utils#configuration-reference');
  });

  test('every internal link of the README points at a heading', () => {
    expect(brokenAnchors(readme)).toEqual([]);
  });
});

test.describe('.env.local.example is the template for the secret file', () => {
  test('it exists, has an entry for every Secret: YES key, and only <placeholder> values', () => {
    expect(exists('.env.local.example')).toBe(true);
    expect(documented.filter((e) => e.secret).length, 'secrets documented').toBeGreaterThanOrEqual(1);
    expect(localExampleProblems(read('.env.local.example'), documented)).toEqual([]);
  });

  test('it is not git-ignored (it is a template) while the real secret files are', () => {
    const ignore = read('.gitignore').split('\n').map((l) => l.trim());
    expect(ignore).toContain('.env.*.local');
    expect(ignore).not.toContain('.env.local.example');
    expect(ignore).not.toContain('.env.example');
  });
});

// ---- negative controls: each checker must be able to fail ------------------------------------------------------------

test.describe('negative controls: the checks report a gap when there is one', () => {
  const SNIPPET = `
    import { loadEnv } from '@automation/referenced-automation-utils';
    const env = loadEnv();
    // env.get('COMMENTED_OUT') is only a comment and must not count
    const a = env.get('SOME_NEW_KEY');
    const b = env.getInt('ANOTHER_NEW_KEY', 5);
    const c = process.env.THIRD_NEW_KEY;
    const d = process.env['FOURTH_NEW_KEY'];
    const e = loadEnv().getBoolean('FIFTH_NEW_KEY', false);
    const f = process.env[dynamicName];
    const g = map.get('NOT_AN_ENV_READ');
    createPlaywrightConfig({ baseUrlKey: 'SIXTH_NEW_KEY' });
  `;
  const EXAMPLE_WITHOUT_THEM = `# Which browser.\n# Read from: x\n# Values: x\n# Default: x | Required: no | Secret: no\n# Example: BROWSER=firefox\n# BROWSER=chromium\n`;

  test('the code extractor finds env.get*, process.env and baseUrlKey reads - and ignores comments, dynamic names and other .get calls', () => {
    const reads = envReadsInCode(SNIPPET);
    expect([...reads.loadEnv].sort()).toEqual(['ANOTHER_NEW_KEY', 'FIFTH_NEW_KEY', 'SIXTH_NEW_KEY', 'SOME_NEW_KEY']);
    expect([...reads.processEnv].sort()).toEqual(['FOURTH_NEW_KEY', 'THIRD_NEW_KEY']);
  });

  test('a variable the code reads but .env.example lacks is reported (and one that is documented is not)', () => {
    const reads = envReadsInCode(SNIPPET);
    const wanted = [...reads.loadEnv, ...reads.processEnv];
    expect(missingFrom(wanted, documentedVariables(EXAMPLE_WITHOUT_THEM).map((e) => e.name))).toEqual(['ANOTHER_NEW_KEY', 'FIFTH_NEW_KEY', 'FOURTH_NEW_KEY', 'SIXTH_NEW_KEY', 'SOME_NEW_KEY', 'THIRD_NEW_KEY']);
    expect(missingFrom(['BROWSER'], documentedVariables(EXAMPLE_WITHOUT_THEM).map((e) => e.name))).toEqual([]);
  });

  test('the shell extractor finds ${X:-}, %X% and defined X, and skips what the script assigns itself', () => {
    expect([...envReadsInShell('# ${COMMENTED:-}\nLOCAL=0\nif [ -n "${NPM_THING:-}" ]; then echo "$LOCAL"; fi\nexport PLAYWRIGHT_THING', 'sh')].sort()).toEqual(['NPM_THING', 'PLAYWRIGHT_THING']);
    expect([...envReadsInShell('REM %COMMENTED%\nset "LOCAL=1"\nif defined USE_THING echo %LOCAL% %TEMP%\nif "%OTHER_THING%"=="1" echo x', 'bat')].sort()).toEqual(['OTHER_THING', 'USE_THING']);
    expect([...envReadsInShell('  - if [ -n "${REG:-}" ]; then echo $CI_COMMIT_BRANCH; fi\n  - echo ${AUDIT:+--run}', 'yml')].sort()).toEqual(['AUDIT', 'REG']);
  });

  test('an entry that lacks a metadata line is reported, each line by name', () => {
    const entries = documentedVariables(`# What it is for.\n# Read from: x\n# Default: 1 | Required: no | Secret: no\n# Example: A_KEY=1\n# A_KEY=1\n\n# Read from: x\n# Values: x\n# Default: 1 | Secret: no\n# Example: B_KEY=1\n# B_KEY=1\n`);
    expect(entries.map((e) => e.name)).toEqual(['A_KEY', 'B_KEY']);
    const problems = missingMetadata(entries);
    expect(problems).toContain('A_KEY: no "Values:" line');
    expect(problems).toContain('B_KEY: no description line');
    expect(problems).toContain('B_KEY: no "Required:" line');
    expect(problems.filter((p) => p.startsWith('A_KEY')).length).toBe(1);
    expect(missingMetadata(documented.slice(0, 1))).toEqual([]);
  });

  test('a documented key that nothing reads is reported unless it is on the pass-through list', () => {
    const documentedText = `${EXAMPLE_WITHOUT_THEM}\n# Stale.\n# Read from: x\n# Values: x\n# Default: x | Required: no | Secret: no\n# Example: STALE_KEY=1\n# STALE_KEY=1\n`;
    const names = documentedVariables(documentedText).map((e) => e.name);
    expect(missingFrom(names, new Set(['BROWSER']))).toEqual(['STALE_KEY']);
    expect(missingFrom(names, new Set(['BROWSER', 'STALE_KEY']))).toEqual([]);
  });

  test('"Read from" that contradicts the code is reported, both ways', () => {
    const entries = documentedVariables(`# a\n# Read from: the real environment only\n# Values: x\n# Default: x | Required: no | Secret: no\n# Example: A=1\n# A=1\n\n# b\n# Read from: .env files or the real environment\n# Values: x\n# Default: x | Required: no | Secret: no\n# Example: B=1\n# B=1\n`);
    const problems = readFromProblems(entries, new Set(['A']), new Set(['B']));
    expect(problems.length).toBe(2);
    expect(problems[0]).toContain('A: read through loadEnv()');
    expect(problems[1]).toContain('B: read only from the real environment');
    expect(readFromProblems(entries, new Set(['B']), new Set(['A']))).toEqual([]);
  });

  test('a README table that differs from the file is reported: a missing row, an extra row, a wrong Secret mark, a short row', () => {
    const entries = documentedVariables(`# a\n# Read from: x\n# Values: x\n# Default: x | Required: no | Secret: YES - hide it\n# Example: SECRET_KEY=1\n# SECRET_KEY=1\n\n# b\n# Read from: x\n# Values: x\n# Default: x | Required: no | Secret: no\n# Example: PLAIN_KEY=1\n# PLAIN_KEY=1\n`);
    const table = (rows: string) => referenceTableRows(`intro\n## Configuration reference\n\n| Name | Purpose | Default | Required | Secret |\n|---|---|---|---|---|\n${rows}\n## Next\n| \`OUTSIDE\` | x | x | no | no |\n`);
    expect(tableProblems(table('| `SECRET_KEY` | p | d | no | YES |\n| `PLAIN_KEY` | p | d | no | no |'), entries)).toEqual([]);
    expect(tableProblems(table('| `SECRET_KEY` | p | d | no | YES |'), entries)).toEqual(['README table has no row for PLAIN_KEY']);
    expect(tableProblems(table('| `SECRET_KEY` | p | d | no | YES |\n| `PLAIN_KEY` | p | d | no | no |\n| `EXTRA_KEY` | p | d | no | no |'), entries)).toEqual(['README table lists EXTRA_KEY, which .env.example does not']);
    expect(tableProblems(table('| `SECRET_KEY` | p | d | no | no |\n| `PLAIN_KEY` | p | d | no | no |'), entries)).toEqual(['SECRET_KEY: README Secret column says "no", .env.example says YES']);
    expect(tableProblems(table('| `SECRET_KEY` | p | d | no | YES |\n| `PLAIN_KEY` | p | no |'), entries)[0]).toContain('PLAIN_KEY: the row has');
    expect(table('| `A` | p | d | no | no |').map((r) => r.name), 'rows after the next ## heading are not part of the section').toEqual(['A']);
  });

  test('a secret template that misses a secret, lists a non-secret or holds a real-looking value is reported', () => {
    const entries = documentedVariables(`# a\n# Read from: x\n# Values: x\n# Default: x | Required: no | Secret: YES - hide it\n# Example: SECRET_KEY=1\n# SECRET_KEY=\n\n# b\n# Read from: x\n# Values: x\n# Default: x | Required: no | Secret: no\n# Example: PLAIN_KEY=1\n# PLAIN_KEY=\n`);
    expect(localExampleProblems('# SECRET_KEY="<secret-key>"\n', entries)).toEqual([]);
    expect(localExampleProblems('# note only\n', entries)).toEqual(['.env.local.example has no entry for the secret SECRET_KEY']);
    expect(localExampleProblems('# SECRET_KEY="<secret-key>"\n# PLAIN_KEY="<plain>"\n', entries)[0]).toContain('PLAIN_KEY, which .env.example does not mark Secret: YES');
    expect(localExampleProblems('SECRET_KEY=hunter2\n', entries)).toEqual(['SECRET_KEY: the value must be a double-quoted <placeholder>, not a real-looking value']);
    const realLooking = ['Xk9', 'sjd8', 'fh2'].join(''); // assembled: a literal here would be flagged by the repo's own secret scan
    expect(localExampleProblems(`# SECRET_KEY="${realLooking}"\n`, entries)[0]).toContain('not a real-looking value');
  });

  test('the tip counter and the anchor check can fail', () => {
    expect(countOccurrences(`${TIP_TITLE}\nmore\n${TIP_TITLE}`, TIP_TITLE)).toBe(2);
    expect(countOccurrences('no tip here', TIP_TITLE)).toBe(0);
    expect(brokenAnchors('# Title\n\n## First part (`x`)\n\nsee [a](#first-part-x) and [b](#no-such-heading)')).toEqual(['no-such-heading']);
    expect(brokenAnchors('## Section: one, two\n[a](#section-one-two)')).toEqual([]);
  });
});
