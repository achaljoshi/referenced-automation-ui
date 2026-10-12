import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Working inside this repo on Windows (PowerShell, VS Code): a package's own commands are not linked into its own
// node_modules/.bin, a backslash path finds no test, a POSIX `NAME=value command` line does not run in PowerShell.
// These tests keep the documentation, the npm scripts and the helper scripts honest about that. The checkers are
// exported functions and each one has a negative control at the bottom that proves it can fail.

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

const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string>; bin: Record<string, string> };

/** Everything a person copies commands from: README, docs/, CONTRIBUTING, the CLI usage text, the helper scripts, the pipeline. (CHANGELOG is history, not instructions.) */
const DOC_FILES = ['README.md', 'CONTRIBUTING.md', ...filesUnder('docs', /\.md$/), ...filesUnder('src/cli', /\.ts$/), ...filesUnder('scripts', /./), '.gitlab-ci.yml'].filter(exists);

const EXPLANATION = /depends on this package|dependent project/i;

/** Lines that run `npx <one of this package's own commands>` without saying, on the same line or in the 8 lines above, that it is for a project that depends on this package. */
export function npxOwnBinProblems(text: string, bins: string[], window = 8): string[] {
  const lines = text.split('\n');
  const problems: string[] = [];
  lines.forEach((line, index) => {
    for (const bin of bins) {
      if (!new RegExp(`\\bnpx\\s+(?:--?\\S+\\s+)*${bin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(line)) continue;
      const context = lines.slice(Math.max(0, index - window), index + 1).join('\n');
      if (!EXPLANATION.test(context)) problems.push(`line ${index + 1}: "${line.trim().slice(0, 80)}" runs npx ${bin} without saying it is for a project that depends on this package`);
    }
  });
  return problems;
}

/** `playwright test` followed by a path that contains a backslash (it finds no tests: Playwright matches the pattern, not the path). */
export function backslashTestPaths(text: string): string[] {
  return text.split('\n').flatMap((line, index) => (/\bplaywright test\b[^\n]*?\s[^\s"'`|;&]*\\[^\s]*/.test(line) ? [`line ${index + 1}: ${line.trim().slice(0, 100)}`] : []));
}

/** npm aliases that must exist so a package's own bin can be run inside its own repo: for each bin, a script `node <the bin's path>`. */
export function binAliasProblems(scripts: Record<string, string>, bin: Record<string, string>): string[] {
  const commands = Object.entries(scripts);
  return Object.entries(bin).flatMap(([name, file]) => {
    const command = `node ${file.replace(/^\.\//, '')}`;
    return commands.some(([, value]) => value === command) ? [] : [`bin "${name}" has no npm script whose command is "${command}"`];
  });
}

interface Fence {
  lang: string;
  start: number;
  end: number;
  body: string[];
}
const fences = (markdown: string): Fence[] => {
  const lines = markdown.split('\n');
  const found: Fence[] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = /^\s*```(\w*)\s*$/.exec(lines[i] as string);
    if (!open) continue;
    let end = i + 1;
    while (end < lines.length && !/^\s*```\s*$/.test(lines[end] as string)) end++;
    found.push({ lang: open[1] as string, start: i, end, body: lines.slice(i + 1, end) });
    i = end;
  }
  return found;
};

/** A bash block that sets an environment variable for a command (`NAME=value npx ...`, `export NAME=`) or uses a `(cd x && y)` subshell must be followed, within 3 lines, by a PowerShell block. */
export function posixOnlyExamples(markdown: string): string[] {
  const blocks = fences(markdown);
  const posix = /^\s*(?:export\s+[A-Z][A-Z0-9_]*=|[A-Z][A-Z0-9_]*=\S*(?:\s+[A-Z][A-Z0-9_]*=\S*)*\s+(?:npx|npm|node)\b|\(cd [^)]*&&)/;
  return blocks.flatMap((block, index) => {
    if (!['bash', 'sh', 'shell', ''].includes(block.lang) || !block.body.some((line) => posix.test(line))) return [];
    const next = blocks[index + 1];
    return next && next.lang === 'powershell' && next.start - block.end <= 3 ? [] : [`line ${block.start + 1}: a bash example that needs a PowerShell equivalent right after it`];
  });
}

/** An echoed `set BROWSER=... && ...` hint (cmd only) must be followed within 2 lines by the PowerShell form. */
export function cmdOnlyBrowserHints(text: string): string[] {
  const lines = text.split('\n');
  return lines.flatMap((line, index) => (/\bset BROWSER=\w+/i.test(line) && !lines.slice(index, index + 3).some((l) => l.includes('$env:BROWSER')) ? [`line ${index + 1}: ${line.trim()}`] : []));
}

/** The "Windows first run" section of the README. */
export function windowsSection(readme: string): string {
  const start = readme.indexOf('\n## Windows first run');
  if (start < 0) return '';
  const rest = readme.slice(start + 1);
  const end = rest.indexOf('\n## ', 3);
  return end < 0 ? rest : rest.slice(0, end);
}

test.describe('the package can run its own commands inside its own repo', () => {
  test('package.json has the alias codegen-to-tests, and every bin has an alias that runs the same file', () => {
    expect(pkg.scripts['codegen-to-tests']).toBe('node dist/cli/codegenToTests.js');
    expect(pkg.scripts['convert:codegen'], 'the older name keeps working').toBe('node dist/cli/codegenToTests.js');
    expect(Object.keys(pkg.bin).length).toBeGreaterThan(0);
    expect(binAliasProblems(pkg.scripts, pkg.bin)).toEqual([]);
    expect(pkg.scripts.clean, 'the clean script expands *.tgz itself (a shell that does not fails with "Illegal characters in path")').toBe('rimraf --glob dist "*.tgz"');
  });

  test('smoke: `npm run codegen-to-tests --silent -- --help` runs the converter from the repo root and prints its usage', () => {
    expect(exists('dist/cli/codegenToTests.js'), 'dist is built (pretest runs npm run build)').toBe(true);
    const run = spawnSync('npm run codegen-to-tests --silent -- --help', { shell: true, cwd: root, encoding: 'utf8' });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain('ui-codegen-to-playwright - turn a Playwright recording into a test');
    expect(run.stdout).toContain('Usage:');
    expect(run.stdout).toContain('--page-objects');
  });

  test('the usage text shows the in-repo forms and labels the npx form as the one for a dependent project', () => {
    const usage = read('src/cli/codegenToTests.ts');
    expect(usage).toContain('npm run codegen-to-tests -- recordings/login.spec.ts');
    expect(usage).toContain('node dist/cli/codegenToTests.js recordings/login.spec.ts');
    expect(usage).toContain('npm run build');
    expect(usage).toMatch(/From a project that depends on this package[^]*npx ui-codegen-to-playwright recordings\/login\.spec\.ts/);
  });

  test('no document, usage text, script or pipeline runs `npx <own command>` unless it says it is for a project that depends on this package', () => {
    expect(DOC_FILES).toEqual(expect.arrayContaining(['README.md', 'CONTRIBUTING.md', 'src/cli/codegenToTests.ts', '.gitlab-ci.yml', 'scripts/setup.bat']));
    const bins = Object.keys(pkg.bin);
    for (const file of DOC_FILES) expect(npxOwnBinProblems(read(file), bins), file).toEqual([]);
    // and the README does show that form, once, with the explanation
    expect(read('README.md')).toContain('**From a project that depends on this package**');
  });

  test('the generated test header stays as the converter writes it (tests/generated is compared against converter output)', () => {
    for (const file of filesUnder('tests/generated', /\.spec\.ts$/)) expect(read(file), file).toMatch(/^\/\/ Generated by ui-codegen-to-playwright from /m);
  });
});

test.describe('the documentation is correct for PowerShell and for Windows paths', () => {
  const readme = read('README.md');

  test('README has a Windows first run section with the setup, build, test-selection steps and the table of first errors', () => {
    const section = windowsSection(readme);
    expect(section, 'the heading "## Windows first run"').not.toBe('');
    for (const needle of [
      '.\\scripts\\setup.bat',
      '.\\scripts\\setup.bat --local',
      'npm run build',
      'npm run install:browsers',
      'npm test',
      'tests/demo.spec.ts',
      '-g "',
      '--project=',
      '$env:BROWSER = "msedge"',
      'Remove-Item Env:BROWSER',
      "'tsc' is not recognized",
      'Cannot find module',
      'No tests found',
      'Illegal characters in path',
      'rimraf --glob dist "*.tgz"',
      "'ui-codegen-to-playwright' is not recognized",
      'npm run codegen-to-tests --',
      "Executable doesn't exist",
      'npx playwright install',
      'PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD',
      '.env.qa.local',
      'LOG_LEVEL',
      'real environment',
    ])
      expect(section, needle).toContain(needle);
    expect(readme, 'sap-only advice does not belong here').not.toMatch(/JAVA_HOME|JDK/);
  });

  test('no document has `playwright test` followed by a backslash path (the file finds no tests)', () => {
    for (const file of [...DOC_FILES, 'package.json']) expect(backslashTestPaths(read(file)), file).toEqual([]);
  });

  test('every bash example in the README that sets an environment variable or uses a (cd ... && ...) subshell is followed by a PowerShell one', () => {
    expect(fences(readme).filter((f) => f.lang === 'powershell').length, 'PowerShell blocks in the README').toBeGreaterThanOrEqual(8);
    expect(posixOnlyExamples(readme)).toEqual([]);
  });

  test('setup.bat tells a PowerShell user how to call it and shows the PowerShell form of set BROWSER=...', () => {
    for (const file of filesUnder('scripts', /\.bat$/)) expect(cmdOnlyBrowserHints(read(file)), file).toEqual([]);
    expect(read('scripts/setup.bat')).toContain('.\\scripts\\setup.bat');
    expect(read('scripts/setup.bat')).toContain('$env:BROWSER = "msedge"; npm test');
  });

  test('the VS Code launch configuration works on Windows: no ${relativeFile} (backslashes) and a program that is a JavaScript file', () => {
    const launch = read('.vscode/launch.json');
    expect(launch).not.toContain('${relativeFile}');
    expect(launch).toContain('${fileBasename}');
    const programs = [...launch.matchAll(/"program":\s*"\$\{workspaceFolder\}\/([^"]+)"/g)].map((m) => m[1] as string);
    expect(programs.length).toBeGreaterThan(0);
    for (const program of programs) {
      expect(program.endsWith('.js'), `${program}: node_modules/.bin entries are shell scripts on Windows`).toBe(true);
      expect(exists(program), program).toBe(true);
    }
  });
});

// ---- negative controls: each checker must be able to fail ------------------------------------------------------------

test.describe('negative controls: the checks flag a bad snippet and accept a good one', () => {
  const BINS = ['ui-codegen-to-playwright'];

  test('npx <own command> is flagged alone, accepted with the explanation on the same line or within 8 lines above, flagged when it is further away', () => {
    expect(npxOwnBinProblems('npx ui-codegen-to-playwright recordings/x.spec.ts', BINS)).toHaveLength(1);
    expect(npxOwnBinProblems('Run `npx ui-codegen-to-playwright x` (for a project that depends on this package).', BINS)).toEqual([]);
    const good = ['From a project that depends on this package:', '', '```', 'npx ui-codegen-to-playwright x', '```'].join('\n');
    expect(npxOwnBinProblems(good, BINS)).toEqual([]);
    const far = ['A dependent project may do this.', ...Array.from({ length: 9 }, () => 'filler'), 'npx ui-codegen-to-playwright x'].join('\n');
    expect(npxOwnBinProblems(far, BINS)).toHaveLength(1);
    const near = ['A dependent project may do this.', ...Array.from({ length: 7 }, () => 'filler'), 'npx ui-codegen-to-playwright x'].join('\n');
    expect(npxOwnBinProblems(near, BINS)).toEqual([]);
    expect(npxOwnBinProblems('npx playwright test\nnpm run codegen-to-tests -- x\nnpx ui-codegen-to-playwright-other', BINS)).toEqual([]);
    expect(npxOwnBinProblems('npx -y ui-codegen-to-playwright x', BINS)).toHaveLength(1);
  });

  test('a backslash path after playwright test is flagged; forward slashes, titles and plain options are not', () => {
    expect(backslashTestPaths('npx playwright test tests\\demo.spec.ts')).toHaveLength(1);
    expect(backslashTestPaths('npx playwright test --project=chromium tests\\demo.spec.ts --headed')).toHaveLength(1);
    expect(backslashTestPaths('npx playwright test tests/demo.spec.ts')).toEqual([]);
    expect(backslashTestPaths('npx playwright test -g "logs in"')).toEqual([]);
    expect(backslashTestPaths('cd C:\\work\\repo\nnpx playwright test')).toEqual([]);
  });

  test('a bin without an npm alias, or with an alias that runs something else, is reported', () => {
    const bin = { 'my-tool': './dist/cli/tool.js' };
    expect(binAliasProblems({ 'run-tool': 'node dist/cli/tool.js' }, bin)).toEqual([]);
    expect(binAliasProblems({ build: 'tsc' }, bin)).toHaveLength(1);
    expect(binAliasProblems({ 'run-tool': 'node dist/cli/other.js' }, bin)).toHaveLength(1);
    expect(binAliasProblems({ 'run-tool': 'node dist/cli/tool.js' }, { ...bin, second: './dist/cli/second.js' })).toEqual(['bin "second" has no npm script whose command is "node dist/cli/second.js"']);
  });

  test('a bash example with an inline variable, export or (cd && ...) needs a PowerShell block right after it', () => {
    const fence = (lang: string, body: string) => `\`\`\`${lang}\n${body}\n\`\`\``;
    expect(posixOnlyExamples(fence('bash', 'ENV=stage BROWSER=firefox npx playwright test'))).toHaveLength(1);
    expect(posixOnlyExamples(fence('bash', 'export NPM_REGISTRY_URL="x"'))).toHaveLength(1);
    expect(posixOnlyExamples(fence('bash', '(cd ../utils && ./scripts/create-package.sh --local)'))).toHaveLength(1);
    expect(posixOnlyExamples(`${fence('bash', 'ENV=stage npx playwright test')}\n\n${fence('powershell', '$env:ENV = "stage"; npx playwright test')}`)).toEqual([]);
    expect(posixOnlyExamples(`${fence('bash', 'ENV=stage npx playwright test')}\n\nlots\nof\ntext\nbetween\n\n${fence('powershell', 'x')}`)).toHaveLength(1);
    expect(posixOnlyExamples(fence('bash', 'npm test\nnpx playwright test tests/demo.spec.ts'))).toEqual([]);
    expect(posixOnlyExamples(fence('powershell', '$env:ENV = "stage"; npx playwright test'))).toEqual([]);
  });

  test('an echoed set BROWSER=... hint without the PowerShell form is flagged', () => {
    expect(cmdOnlyBrowserHints('echo   set BROWSER=msedge ^&^& npm test')).toHaveLength(1);
    expect(cmdOnlyBrowserHints('echo   set BROWSER=msedge ^&^& npm test\necho   PowerShell: $env:BROWSER = "msedge"; npm test')).toEqual([]);
    expect(cmdOnlyBrowserHints('echo nothing to see')).toEqual([]);
  });

  test('windowsSection finds the section and nothing when the heading is missing', () => {
    expect(windowsSection('# T\n\n## Windows first run\nbody\n\n## Next\nother')).toBe('## Windows first run\nbody\n');
    expect(windowsSection('# T\n\n## Something else\nbody')).toBe('');
  });
});
