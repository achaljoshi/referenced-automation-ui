# referenced-automation-ui

Reusable Playwright UI automation framework: an `actions` layer (`actions.click`, `actions.fill`, `actions.waitForVisible`, ...) covering navigation, element interaction, waits, frames, new tabs, downloads/uploads, and network mocking. Page objects and components are plain factory functions that call these actions against their own locators - no base classes to extend, no raw Playwright boilerplate per page object, and every action is logged (console + `logs/automation.log` + Playwright's own step/trace report) automatically.

Playwright Test itself already manages browser/context/page lifecycle, retries, parallelism, and failure screenshots/video/traces declaratively via `playwright.config.ts` - this package deliberately doesn't reimplement any of that (unlike the old Selenium-based framework, which had to hand-build a DriverFactory/DriverManager/Hooks layer for exactly this). What it adds is a consistent, logged action layer on top.

## Quick start

```bash
./scripts/setup.sh          # npm ci + playwright install --with-deps (scripts/setup.bat on Windows)
npm test                     # full suite
npm run test:smoke           # only @smoke-tagged tests
npm run test:regression      # only @regression-tagged tests
```

`setup.sh`/`setup.bat` work from a completely fresh clone of the whole repo family, in any order: this repo depends on `referenced-automation-utils`, so if `../shared-packages/automation-referenced-automation-utils-*.tgz` doesn't exist yet, setup builds it automatically from `../referenced-automation-utils` (cloning nothing on its own - that sibling repo must already be checked out next to this one). See [Distributing this package](#distributing-this-package) for the layout this assumes.

```ts
import { actions } from '@automation/referenced-automation-ui';
import type { Page } from '@playwright/test';

export function createLoginPage(page: Page) {
  const username = page.locator('#username');
  const password = page.locator('#password');
  const submit = page.locator('#login-button');

  return {
    // Fluent navigation: an action that moves to a new page returns that
    // page's own object, so a test chains straight into it - see
    // "Structuring page objects" below for the full pattern.
    async loginAs(user: string, pass: string): Promise<DashboardPage> {
      await actions.fill(username, user);
      await actions.fill(password, pass);
      await actions.click(submit);
      return createDashboardPage(page);
    },
  };
}
```

## Structuring page objects, components, and fixtures

This is the pattern `tests/support/` in this repo follows, and the one every consuming project should copy for its own pages - see `tests/support/LoginPage.ts`, `DashboardPage.ts`, `components/FileUploadWidget.ts`, and `fixtures.ts` for the real, working versions of everything below.

Page objects here are plain factory functions, not classes - `createLoginPage(page)` returns an object literal of methods closing over its own locators. There's no base class to extend and nothing to instantiate with `new`; the function *is* the constructor. This favors Playwright's own idiom (fixtures as the composition/DI mechanism) over a Java-style class hierarchy.

**One page, one page object.** Don't let a page object grow to cover more than one screen/view - `createLoginPage` only knows the login form, `createDashboardPage` only knows the dashboard. A method that navigates to a new page returns that page's own object (`loginAs()` returns a `DashboardPage`) instead of the caller guessing what state the app ended up in.

**Repeated widgets are their own factory functions, not copy-pasted locators.** A modal, a data table, a nav bar, a file-upload control that appears on several pages - model it once as a component factory scoped to a root `Locator`, and have every page object that embeds it call the same function, instead of every page object reimplementing that widget's interactions from scratch:

```ts
import { actions } from '@automation/referenced-automation-ui';
import type { Locator, Page } from '@playwright/test';

export function createFileUploadWidget(page: Page, root: Locator) {
  const fileInput = root.locator('input[type="file"]');
  const fileNameLabel = root.locator('#file-name');

  return {
    async pickFile(filePath: string): Promise<void> {
      await actions.uploadFile(fileInput, filePath);
    },
    async uploadedFileName(): Promise<string> {
      return actions.getText(fileNameLabel);
    },
  };
}

// in a page object that embeds it:
const fileUpload = createFileUploadWidget(page, page.locator('#dashboard-section'));
```

**Page objects are built inside fixtures, not in every test.** Extend this package's own `test` with one fixture per page object, so a spec destructures the page it needs already-navigated-to instead of every test repeating `createLoginPage(page)` plus whatever setup gets it into the right state. The fixture is where the object gets created - the page object module itself exports only the factory function and its interface, nothing else:

```ts
import { test as base, expect } from '@automation/referenced-automation-ui';
import { createLoginPage, type LoginPage } from './LoginPage';
import type { DashboardPage } from './DashboardPage';

interface PageFixtures {
  loginPage: LoginPage;
  dashboardPage: DashboardPage; // already authenticated, for specs that don't care about the login step
}

export const test = base.extend<PageFixtures>({
  loginPage: async ({ page }, use) => {
    const loginPage = createLoginPage(page);
    await loginPage.open('/login');
    await use(loginPage);
  },
  dashboardPage: async ({ page }, use) => {
    const loginPage = createLoginPage(page);
    await loginPage.open('/login');
    await use(await loginPage.loginAs('user', 'pass'));
  },
});
export { expect };
```

```ts
// a spec then just asks for the page it needs:
test('shows the welcome banner', async ({ dashboardPage }) => {
  expect(await dashboardPage.isLoaded()).toBe(true);
});
```

## What's included

All of the below are standalone functions imported as `import { actions } from '@automation/referenced-automation-ui'`, called as `actions.click(locator)` / `actions.goto(page, url)` etc. - element actions take a `Locator` as their first argument, page actions take a `Page`.

| Capability | Functions |
|---|---|
| Navigation | `goto`, `reload`, `goBack`, `goForward`, `currentUrl`, `title` |
| Actions | `click`, `dblClick`, `rightClick`, `fill`, `type` (real keystrokes), `clear`, `check`, `uncheck`, `selectOption`, `hover`, `dragAndDrop`, `pressKey`, `focus`, `uploadFile` |
| Reads | `getText`, `getValue`, `getAttribute`, `isVisible`, `isEnabled`, `isChecked`, `count`, `allText` |
| Explicit waits | `waitForVisible`, `waitForHidden`, `waitForUrlContains`, `waitForLoadState`, `waitForResponseMatching` (Playwright's Locator API auto-waits on every action above already - these cover the conditions that don't) |
| Screenshots | `screenshotPage`, `screenshotElement` (automatic on-failure screenshots are configured in `playwright.config.ts`, not something you call yourself) |
| Frames | `frame(page, selector)` returns a `FrameLocator` scoped inside an iframe |
| New tabs/popups | `waitForNewTab(page, action)` |
| Downloads | `downloadFile(page, action, savePath)` |
| Uploads | `uploadFile(locator, filePaths)` |
| Network mocking | `mockRoute(page, pattern, response)`, `blockRoute(page, pattern)`, `unrouteAll(page)` |
| Step visibility | Every function above is wrapped in both `test.step()` (Playwright's HTML report/trace viewer) and the shared logger (console + `logs/automation.log`, visible in CI job logs) - see `src/base/step.ts` |

## Environments, browsers, and devices

Same `.env.<name>` + `ENV=<name>` pattern as the rest of this family (see `referenced-automation-utils`'s README for the full explanation) - with one addition here: `playwright.config.ts` resolves the env file relative to its own location (`__dirname`), not the process's working directory, so the correct `.env.<ENV>` loads identically whether you run tests from a terminal, an IDE's "Run test" button, or a CI job with a different working directory.

```bash
ENV=stage BROWSER=firefox HEADLESS=false npx playwright test
```

Every option below is read from the active env file, or overridable inline the same way:

| Variable | Default | What it controls |
|---|---|---|
| `BASE_URL` | _(unset)_ | `use.baseURL` |
| `HEADLESS` | `true` | headed vs. headless |
| `BROWSER` | `chromium` | `chromium` \| `firefox` \| `webkit` \| a system channel (`msedge`, `chrome`, ...) \| `all` (the 3 bundled browsers) \| `all-devices` (see below) |
| `DEVICE` | _(unset)_ | any [Playwright device name](https://playwright.dev/docs/emulation#devices) (e.g. `"iPhone 15"`, `"Pixel 7"`, `"iPad Pro 11"`) - overrides `BROWSER` when set |
| `WORKERS` | Playwright's own default | parallel worker count, e.g. `4` or `50%` |
| `RETRIES` | `1` in CI, `0` locally | per-test retry count |
| `MAX_FAILURES` | unlimited | stop the run after N failures (fail-fast) |
| `TEST_TIMEOUT_MS` | `30000` | per-test timeout |
| `EXPECT_TIMEOUT_MS` | `10000` | `expect()` assertion timeout |
| `ACTION_TIMEOUT_MS` | `15000` | per-action timeout (click, fill, ...) |
| `NAVIGATION_TIMEOUT_MS` | `30000` | per-navigation timeout |
| `GLOBAL_TIMEOUT_MS` | unlimited | whole-run timeout cap |
| `SLOW_MO_MS` | `0` | delay between actions - set e.g. `250` to watch a headed run |
| `LOCALE` / `TIMEZONE_ID` / `COLOR_SCHEME` | unset | browser context locale/timezone/`prefers-color-scheme` |
| `IGNORE_HTTPS_ERRORS` | `false` | for self-signed certs in lower environments |
| `VIEWPORT_WIDTH` / `VIEWPORT_HEIGHT` | `1280x800` | desktop project viewport (device projects use their own preset size) |
| `TEST_ID_ATTRIBUTE` | `data-testid` | which DOM attribute `page.getByTestId()` matches |

### Device emulation

```bash
DEVICE="iPhone 15" npm test        # one specific device
BROWSER=all-devices npm test       # iPhone 15 + Pixel 7 + iPad Pro 11 in parallel
```

Any of Playwright's 200+ built-in device presets works via `DEVICE` - the three above are just the default set `all-devices` runs.

### Accessibility (axe-core)

```ts
import { checkAccessibility, expectNoAccessibilityViolations } from '@automation/referenced-automation-ui';

// full results (violations, passes, incomplete, inapplicable)
const results = await checkAccessibility(page, { tags: ['wcag2aa'] });

// or assert directly - throws a readable, per-violation message
await expectNoAccessibilityViolations(page);
```

Both are plain functions taking `page` directly - no page object needed to use them, and nothing stops a page object from calling them internally if that's useful for a given test. `include`/`exclude` scope a scan to part of the page (e.g. skip a third-party widget you don't own); `rules`/`disableRules` add or turn off specific axe rule IDs. See `tests/accessibility.spec.ts` for working examples, including one that deliberately triggers a real violation to prove the assertion actually catches something.

## Allure reporting

Every test run writes raw results to `allure-results/` via the `allure-playwright` reporter (pure JS/TS, no extra runtime needed). Turning those into the viewable HTML report needs a JRE on `PATH` (Allure's report generator is a Java tool) - that's why it's a separate step, not part of `npm test` itself:

```bash
npm test               # also writes allure-results/
npm run allure:report  # generates allure-report/ and opens it in a browser
```

Or split the two steps (e.g. to generate in CI and open locally): `npm run allure:generate`, then `npm run allure:open`.

## CI/CD (GitLab)

`.gitlab-ci.yml` runs on every push to `main` (including a merge request being merged), every merge request, and manual "Run pipeline" from the GitLab UI. It uses Microsoft's official Playwright Docker image (`mcr.microsoft.com/playwright:v1.62.1-noble`, pinned to match this repo's locked Playwright version) with every browser preinstalled, so no `playwright install` step is needed in CI at all.

Stages: `build` (install, compile, lint) → `test` (a `chromium`/`firefox`/`webkit` matrix, plus a separate accessibility job) → `report` (publishes the Allure HTML report to GitLab Pages on `main`).

**One assumption worth checking against your actual GitLab layout:** this repo depends on `referenced-automation-utils`, not yet published to a registry (see [Distributing this package](#distributing-this-package)), so the pipeline clones and packages it fresh in each job via that repo's own `scripts/create-package.sh` - the same script you'd run locally. The clone URL assumes `referenced-automation-utils` lives in the **same GitLab group/namespace** as this repo (`UTILS_REPO_URL` in the YAML, built from `$CI_PROJECT_NAMESPACE`) and is reachable via this job's own `CI_JOB_TOKEN`. If your GitLab layout differs, override `UTILS_REPO_URL` as a CI/CD variable (Settings → CI/CD → Variables) instead of editing the file, and if cross-project job-token access isn't enabled between the two projects, you'll need a project access token there instead.

I don't have a GitLab instance to execute-test this pipeline against directly - the YAML is syntactically valid and the logic was reasoned through carefully, but treat the first real run as the actual verification, the same way you'd want to for any new pipeline.

## Distributing this package

```bash
./scripts/create-package.sh   # writes ../shared-packages/referenced-automation-ui-<version>.tgz
```

## IDE setup

Same as the other repos in this family: VS Code prompts for recommended extensions on open (Playwright Test, ESLint, Prettier); IntelliJ/WebStorm ships ESLint/Prettier wired in plus `npm: test` / `npm: test:smoke` run configurations. Node.js/TypeScript/Playwright support is bundled with WebStorm/IntelliJ Ultimate - nothing to install.

## Testing this package itself

`tests/support/fixture.html` is a small, self-contained local page (login form, dropdown, checkbox, drag-and-drop, an iframe, a popup trigger, a download link, a file input) opened via a `file://` URL - deliberately not a live third-party site, so the suite is fast, deterministic, and has no external network dependency.

`tests/support/` is also the working example of [the page object/component/fixture pattern above](#structuring-page-objects-components-and-fixtures): `LoginPage.ts` and `DashboardPage.ts` are real page object factory functions (one page each, `loginAs()` returns the next page), `components/FileUploadWidget.ts` is a real component factory function, and `fixtures.ts` wires both pages up as Playwright fixtures - `demo.spec.ts` and `accessibility.spec.ts` consume them exactly the way a consuming project's own specs would. `accessibility.spec.ts` runs axe-core against the same fixture - properly labelled form controls and a titled iframe, on purpose, so the "no violations" assertions are actually meaningful rather than trivially true.
