# referenced-automation-ui

Reusable Playwright UI automation framework: an `actions` layer (`actions.click`, `actions.fill`, `actions.waitForVisible`, ...) covering navigation, element interaction, waits, frames, new tabs, downloads/uploads, and network mocking; a `locators` layer (`locators.role.button`, `locators.byLabel`, ...) for Playwright's modern, accessibility-first locators - full `getByRole()` with every ARIA role as its own shorthand, regex/exact matching, and every other `getBy*` locator - instead of falling back to CSS/XPath the way a Selenium-style framework would; and an `assertions` layer wrapping Playwright's full `expect(locator)`/`expect(page)` assertion API with the same logging. Page objects and components are plain factory functions that compose all three - no base classes to extend, no raw Playwright boilerplate per page object, and every action/assertion is logged (console + `logs/automation.log` + Playwright's own step/trace report) automatically.

Playwright Test itself already manages browser/context/page lifecycle, retries, parallelism, and failure screenshots/video/traces declaratively via `playwright.config.ts` - this package deliberately doesn't reimplement any of that (unlike the old Selenium-based framework, which had to hand-build a DriverFactory/DriverManager/Hooks layer for exactly this). What it adds is a consistent, logged action layer on top.

## Quick start

```bash
./scripts/setup.sh          # npm ci + playwright install --with-deps
npm test                     # full suite
npm run test:smoke           # only @smoke-tagged tests
npm run test:regression      # only @regression-tagged tests
```

On Windows use PowerShell and start with `.\scripts\setup.bat` instead of `./scripts/setup.sh` (`scripts\setup.bat` works only in `cmd.exe`); the `npm` lines are the same. [Windows first run](#windows-first-run) lists the commands and the errors people hit first. Every environment variable the framework reads is in [Configuration reference](#configuration-reference) and in the commented template `.env.example`.

`setup.sh`/`setup.bat` run `npm ci`. They first run `npm config set registry "$NPM_REGISTRY_URL"` when that variable is set, so every package - the `@automation/*` ones too (`referenced-automation-utils`, `referenced-automation-api`), each **by the version in `package.json`** - is fetched from your organisation's npm registry. If those packages are not published there yet, or you want to try a change you have not published, run `./scripts/setup.sh --local` (PowerShell: `.\scripts\setup.bat --local`): it builds the sibling repos this one depends on - they must be checked out next to this one - into `../shared-packages` and installs those instead, without touching `package.json` or the lockfile. See [Publishing a package](#publishing-a-package-to-the-registry-jfrog-artifactory) and [Using a package without a registry](#using-a-package-without-a-registry-local-generation).

```ts
import { actions, locators } from '@automation/referenced-automation-ui';
import type { Page } from '@playwright/test';

export function createLoginPage(page: Page) {
  const username = locators.role.textbox(page, 'Username');
  const password = locators.byLabel(page, 'Password'); // input[type=password] has no ARIA role - match by its <label> instead
  const submit = locators.role.button(page, 'Log in');

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

## Windows first run

Commands for PowerShell (Windows PowerShell 5.1 or PowerShell 7, also the VS Code terminal), run from the root of this repo. They are on separate lines on purpose: Windows PowerShell 5.1 has no `&&`.

```powershell
cd C:\path\to\referenced-automation-ui          # every command below runs from the repo root

.\scripts\setup.bat                              # npm ci + the Playwright browsers
# or, when the packages are not in your registry: with referenced-automation-utils and referenced-automation-api
# checked out NEXT TO this repo (same parent folder), build and install them locally instead
.\scripts\setup.bat --local

npm run build                                    # tsc -> dist/ (setup does not build; `npm test` builds first anyway)
npm test                                         # bddgen, then every test in every project
```

If the browsers were not installed (a failed or skipped setup): `npm run install:browsers`, or `npx playwright install`. Pick tests with forward slashes (a backslash path finds nothing):

```powershell
npx playwright test tests/demo.spec.ts                   # one file
npx playwright test -g "logs in with valid credentials"  # one test, by (part of) its title
npx playwright test --project=chromium                   # one project
npx playwright test tests/demo.spec.ts --headed          # watch it
$env:BROWSER = "msedge"; npx playwright test             # a browser that is already installed
Remove-Item Env:BROWSER                                  # undo: a $env: value stays set for the whole terminal session
```

`npx playwright test` does not run `bddgen`: after changing a `.feature` file or a step, use `npm test` or `npx bddgen` first. Convert a recording with `npm run codegen-to-tests -- recordings/login.spec.ts` (see [Record, then convert](#record-then-convert-ui-codegen-to-playwright)). In `cmd.exe` write `set BROWSER=msedge` and run the command on the next line (or `set BROWSER=msedge && npx playwright test`).

| Error | Cause | Fix |
|---|---|---|
| `'tsc' is not recognized as an internal or external command` (or any `'playwright'` / `'bddgen'` / `'eslint'` is not recognized), or there is no `node_modules` folder | The install did not run or failed, so no tool was installed | Run `.\scripts\setup.bat` again and read its FIRST error (the registry, `NPM_REGISTRY_URL`, an `@automation/*` version that is not published: then use `--local`) |
| `Cannot find module '...dist...'` | `dist/` is not built | `npm run build`. If the missing `dist` belongs to a dependency (`@automation/referenced-automation-utils` or `-api`), build and pack it with `.\scripts\setup.bat --local` |
| `Error: No tests found` | The path pattern matched nothing: backslashes, a different folder than the repo root, or a file that is not `*.spec.ts` under `tests/` (the Gherkin tests are in the `bdd` project, generated by `bddgen`) | Run from the repo root and write `npx playwright test tests/demo.spec.ts` with forward slashes, or select by title with `-g "title"` |
| `Illegal characters in path` mentioning `*.tgz` | An old `clean` script tried to delete `*.tgz` through a shell that does not expand it | The script is now `rimraf --glob dist "*.tgz"`: pull the fix (check `scripts.clean` in `package.json`) |
| `'ui-codegen-to-playwright' is not recognized as an internal or external command` | A package's own command is not linked into its own `node_modules/.bin`; only projects that depend on the package get it | Inside this repo: `npm run build`, then `npm run codegen-to-tests -- recordings/login.spec.ts` (or `node dist/cli/codegenToTests.js recordings/login.spec.ts`) |
| `Executable doesn't exist at ... Please run the following command to download new browsers: npx playwright install` | The Playwright browsers are not installed | `npx playwright install` (or `npm run install:browsers`). On a locked-down machine where the download is blocked: `$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1"; .\scripts\setup.bat` and run with an installed browser: `$env:BROWSER = "msedge"` (or `chrome`) |
| A change in a `.env` file seems ignored | The file name does not match: `ENV=qa` (the default) reads `.env.qa` and `.env.qa.local`, never `.env.local`; or the value is shadowed by a variable already set in the terminal (the real environment wins over every file) | Name the file after the environment, and look at `Get-ChildItem Env:` for a leftover value (`Remove-Item Env:NAME`) |
| `LOG_LEVEL` (or `LOG_FILE`, `RANDOM_SEED`, `NO_COLOR`, `TZ`, ...) in a `.env` file has no effect | These are read straight from the real environment, never from a file | `$env:LOG_LEVEL = "debug"; npx playwright test` - the "Read from" line of each variable in [Configuration reference](#configuration-reference) says which are which |

## Structuring page objects, components, and fixtures

This is the pattern `tests/support/` in this repo follows, and the one every consuming project should copy for its own pages - see `tests/support/LoginPage.ts`, `DashboardPage.ts`, `components/FileUploadWidget.ts`, and `fixtures.ts` for the real, working versions of everything below.

Page objects here are plain factory functions, not classes - `createLoginPage(page)` returns an object literal of methods closing over its own locators. There's no base class to extend and nothing to instantiate with `new`; the function *is* the constructor. This favors Playwright's own idiom (fixtures as the composition/DI mechanism) over a Java-style class hierarchy.

**One page, one page object.** Don't let a page object grow to cover more than one screen/view - `createLoginPage` only knows the login form, `createDashboardPage` only knows the dashboard. A method that navigates to a new page returns that page's own object (`loginAs()` returns a `DashboardPage`) instead of the caller guessing what state the app ended up in.

**Repeated widgets are their own factory functions, not copy-pasted locators.** A modal, a data table, a nav bar, a file-upload control that appears on several pages - model it once as a component factory scoped to a root `Locator`, and have every page object that embeds it call the same function, instead of every page object reimplementing that widget's interactions from scratch:

```ts
import { actions, locators } from '@automation/referenced-automation-ui';
import type { Locator, Page } from '@playwright/test';

export function createFileUploadWidget(page: Page, root: Locator) {
  const fileInput = locators.byLabel(root, 'Upload a file'); // scoped to root, same as page.locator would be
  const fileNameLabel = root.locator('#file-name'); // a plain element with no accessible name - CSS is the right tool here

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
| Actions | `click`, `dblClick`, `rightClick`, `fill`, `type` (real keystrokes; secrets: see [Secrets are masked](#secrets-are-masked-in-reports-and-logs)), `clear`, `check`, `uncheck`, `selectOption`, `hover`, `dragAndDrop`, `pressKey`, `focus`, `uploadFile` |
| Reads | `getText`, `getValue`, `getAttribute` (these wait for the element), and `isVisible`, `isEnabled`, `isChecked`, `count`, `allText` - the state reads **also wait** (up to the expect timeout) for the state to be reached, so `await actions.isVisible(x)` is right even right after a click. Only the timeout is swallowed (`false` / `0` / `[]`): a strict-mode violation, a closed page or an invalid selector **throws**. To assert something is **absent**, do not read the state: use the web-first form, which retries until it is gone and fails with the page's state - `await assertions.not.toBeVisible(banner)` / `assertions.toBeHidden(banner)` / `assertions.toHaveCount(rows, 0)`. `{ timeout: 0 }` is a 1 ms snapshot: fine for "has it already happened?", wrong for "it is not there", because it passes before the page has rendered the thing |
| Explicit waits | `waitForVisible`, `waitForHidden`, `waitForUrlContains`, `waitForLoadState`, `waitForResponseMatching` (Playwright's Locator API auto-waits on every action above already - these cover the conditions that don't) |
| Screenshots | `screenshotPage`, `screenshotElement` (automatic on-failure screenshots are configured in `playwright.config.ts`, not something you call yourself) |
| Frames | `frame(page, selector)` returns a `FrameLocator` scoped inside an iframe |
| New tabs/popups | `waitForNewTab(page, action)` |
| Downloads | `downloadFile(page, action, savePath)` |
| Uploads | `uploadFile(locator, filePaths)` |
| Network mocking | `mockRoute(page, pattern, response)`, `blockRoute(page, pattern)`, `unrouteAll(page)` |
| Step visibility | Every function above is wrapped in both `test.step()` (Playwright's HTML report/trace viewer) and the shared logger (console + `logs/automation.log`, visible in CI job logs) - see `src/base/step.ts` |

## More of Playwright, as reusable functions

`docs/PLAYWRIGHT_COVERAGE.md` maps Playwright's own documentation to this framework function by function and lists what was added. The families, each a namespace of the package:

| Namespace | What it is for |
|---|---|
| `locators` | beyond role/label/text: `byCss`, `byXpath`, `filterBy`, `either`, `both`, `within`, `frameChain`, tables (`rowWithText`, `cellInRow`, `readTable`) |
| `actions` | the input guide: `setChecked`, `clickWithModifiers`, `canClick` (dry run), `chooseFiles`, `uploadFromMemory`, `pressOnPage`, `dragBy`, `scrollPageTo`, `fillForm`, `downloadAndRead` |
| `dialogs` | `handleDialogDuring(page, action, 'accept' \| 'dismiss' \| { accept: 'text' })` (removes only its own listener, so it coexists with `recordDialogs`), `recordDialogs` |
| `network` | `mockJson`, `mockStatus`, `modifyJsonResponse`, `modifyRequest`, `blockResources`, `routeFromHar`, `mockWebSocket`, `setOffline`, `throttleNetwork`, `captureApiCall`, `trackNetwork` (`find('url')` is an **exact** URL; use `*` for a glob or a RegExp to match a part), `sanitizeHar` (masks credentials in a recorded HAR) |
| `storage` | cookies, local/sessionStorage, `saveStorageState`, `pageAs` (a second signed-in user) |
| `emulation`, `clock` | viewport, dark mode / reduced motion / print, geolocation, permissions, `newPageWith({ locale, timezoneId, device })`; fix or fast-forward time |
| `tabs`, `evaluate` | several tabs; `evaluate`, `waitForPageFunction`, `addInitScript`, browser-API mocks (`mockClipboard`, `stubWindowOpen`) |
| `visual`, `performance` | `ariaSnapshot`, `capture`, `savePdf`; `navigationTiming`, `webVitals`, `expectWithinBudget` (fails when a budgeted metric - LCP in a browser that reports none - was not reported, instead of skipping it) |
| `assertions` | plus `toHaveScreenshot`, `toMatchAriaSnapshot`, `softly(...)`, `eventually(...)`, `pollValue(...)` |
| fixtures | `vars` (`{{uuid}}`, `{{random:email}}`, `{{date:+7d}}`), `pageGuard` (console errors, page errors, failed requests; it only **attaches** what it saw to the report unless you set `test.use({ failOnPageProblems: true })` - the default is to not fail the test), `pageAs` (a second context with the project's `use` options, `baseURL` and video; trace is shared by Playwright); `guardedTest` watches every test |

```ts
await network.mockJson(page, '**/api/orders', { items: [] }, { delayMs: 300 });      // see the loading state, then the empty state
const call = await network.captureApiCall(page, '**/api/save', () => actions.click(save)); // what the UI sent, what came back
await assertions.softly(async () => {                                                  // report everything wrong on the page at once
  await assertions.toHaveText(heading, 'Orders');
  await assertions.toHaveCount(rows, 3);
});
const { page: admin } = await storage.pageAs(browser, 'admin.json');                    // two users in one scenario
```

### Secrets are masked in reports and logs

A typed password must not appear in the HTML report, Allure, JUnit or the log. `actions.fill`, `actions.type`, `actions.typeOnPage` and `actions.fillForm` show `***` instead of the value - in the step title, the log line and any error message - when the field is `<input type=password>`, has an `autocomplete` of `current-password` / `new-password` / `one-time-code`, or its name, label, placeholder, id or test id looks like password / passwd / passcode / pin / otp / secret / token / api key, or when you say so:

```ts
await actions.fill(locators.byLabel(page, 'Card security answer'), answer, { secret: true });   // masked whatever the field is called
await actions.fill(locators.byLabel(page, 'Pin code'), '12', { secret: false });                 // do not guess from the name (a password input stays masked)
```

In Gherkin, a value written as `{{env:NAME}}` is secret: `When I fill in "Nickname" with "{{env:UI_PASSWORD}}"` is masked even in a plain field. If the field cannot be inspected (not there within a second, several matches) it is treated as secret.

Two caveats worth knowing. A secret is entered through the page (`locator.evaluate`) rather than `locator.fill`, because Playwright's own step - `Fill "<value>"` - would print it in every reporter; the same visible/enabled/editable checks apply, and `actions.type` sends synthetic key events (`isTrusted` is false) for a secret. And **Playwright's trace records call parameters**, so a `trace.zip` of a login flow should be treated as sensitive (or turn tracing off for it).

## Gherkin / BDD (`playwright-bdd` 9.2.1)

```gherkin
Scenario: A valid login shows the dashboard
  Given I open the page "/"
  When I fill in "Username" with "ada"
  And I fill in "Password" with "{{env:UI_PASSWORD}}"
  And I click the button "Log in"
  Then I should see the heading "Dashboard"
```

```ts
// features/steps/steps.ts
import { createBdd } from 'playwright-bdd';
import { registerUiSteps, registerDataSteps } from '@automation/referenced-automation-ui';
import { test } from './fixtures';              // mergeTests(bddTest, uiTest) - see features/steps/fixtures.ts

const { Given, When, Then } = createBdd(test);
registerDataSteps({ Given, Then });             // variables, random data, dates, env
registerUiSteps({ Given, When, Then });         // open, click, fill, select, check, tabs, dialogs, downloads, assertions ...
```

Elements are found the way a user finds them - `the button "Save"`, `the field "Country"`, `"Welcome back"` - never by CSS, and every step waits through Playwright's auto-waiting: there is no "I wait N seconds" step on purpose. Every string goes through `{{placeholders}}`. `npm test` runs `bddgen && playwright test`; `npm run test:bdd` only the features; `--grep @smoke` filters. `registerDataSteps` is also in the API package - register it once when features use both.

## Record, then convert (`ui-codegen-to-playwright`)

Playwright records; this makes the recording look like the rest of your suite.

Inside this repo (build first: `npm run build`; the `--` hands what follows to the converter):

```bash
npx playwright codegen https://app.example.com --output recordings/checkout.spec.ts
npm run codegen-to-tests -- recordings/checkout.spec.ts                 # -> tests/generated/checkout.spec.ts (CONSTANTS and LOCATORS at the top)
npm run codegen-to-tests -- recordings/checkout.spec.ts --page-objects  # CONSTANTS + LOCATORS + a page object, in pages/CheckoutPage.ts
npm run codegen-to-tests -- recordings/checkout.spec.ts --data          # typed values become CSV columns, one test per row
```

`node dist/cli/codegenToTests.js recordings/checkout.spec.ts` is the same command without npm (it also needs `npm run build` first); `npm run convert:codegen -- ...` is an older name for `codegen-to-tests`.

**From a project that depends on this package** the command is linked as `ui-codegen-to-playwright` in that project's `node_modules/.bin`, so there you run `npx ui-codegen-to-playwright recordings/checkout.spec.ts` (same arguments). A package's own commands are *not* linked into its own `node_modules/.bin`, so `npx ui-codegen-to-playwright ...` inside this repo fails (on Windows: "'ui-codegen-to-playwright' is not recognized as an internal or external command") - use the two forms above.

The converted test starts with two objects, and its steps only refer to them - so a changed input or a changed page is **one edit at the top**:

```ts
// recorded:   await page.getByLabel('Password').fill('hunter2');   await page.getByRole('button', { name: 'Log in' }).click();
//             await expect(page.getByRole('heading')).toHaveText('Dashboard');   await page.waitForTimeout(500);

const CONSTANTS = {                          // what the recording visited, typed and expected
  urls: { home: '/' },
  inputs: {
    usernameTextbox: 'ada',
    get passwordField() { return env.get('UI_PASSWORD'); },   // recognised secrets are read from the environment, not written down
  },
  expected: { dashboardHeadingText: 'Dashboard' },
} as const;

const LOCATORS = {                           // every element, named once
  passwordField: (scope: Page) => locators.byLabel(scope, 'Password'),
  logInButton: (scope: Page) => role.button(scope, 'Log in'),
  dashboardHeading: (scope: Page) => role.heading(scope, 'Dashboard'),
} as const;

test('login @ui', async ({ page }) => {
  await actions.fill(LOCATORS.passwordField(page), CONSTANTS.inputs.passwordField);
  await actions.click(LOCATORS.logInButton(page));
  await assertions.toHaveText(LOCATORS.dashboardHeading(page), CONSTANTS.expected.dashboardHeadingText);
  // removed: page.waitForTimeout(500) - actions and assertions wait for themselves
});
```

Change `inputs.usernameTextbox` and every step that types it follows; the page moved a button - fix `LOCATORS.logInButton` once. A popup uses the same entries on its own page (`LOCATORS.logInButton(page1)`). With `--page-objects` the same two objects are exported from the top of `pages/<Name>Page.ts` and the test imports them; with `--data` the typed values come from the CSV instead; `--inline` writes everything in the steps (a quick one-off).

- Understands the `playwright-test` output and the `library` one (`(async () => { const browser = await chromium.launch(); ... })()`), parsed with the TypeScript compiler API, so quoting, template strings and nesting are not a problem.
- **Secrets the converter recognises are read from the environment, not written** - which is not the same as "no secret can reach the file". Replaced by `env.get('UI_...')`: a value typed into a field named like a password, token, secret, PIN or API key (by `fill`, `pressSequentially`, `keyboard.type` and key-by-key presses after such a field was focused; the value such a field is expected to have); cookie values in `addCookies`; credential-named properties and headers (`Authorization`, `x-api-key`, `password`, `token` ... in `setExtraHTTPHeaders`, `newContext` / `test.use` options, route handlers, storage writes); `token=` / `access_token=` / `api_key=` / `password=` / `sig=` query parameters in URLs and expected URLs (credentials in a URL's user-info part are dropped); `Bearer` / `Basic` values, JWTs and `document.cookie = '...'` in evaluated code. Credentials inside a function that runs in the browser are handed in as the argument of `page.evaluate`, or masked as `'***'` when that is not possible. `--param 'account=ACCOUNT'` marks more fields. The command prints which variables to set and warns about each replacement. A secret the rules do not recognise (a password in a free-text field, a key in a custom header name) is written as recorded: **read the generated file before committing it**.
- **`test.skip` / `test.fixme` / `test.fail` / `test.only` are kept** - on the test itself or inherited from `test.describe.skip|fixme|only` - so a skipped recording never comes back live. A conditional `test.skip(condition, reason)` is kept at the top of the file (it then applies to every converted test; a warning says so). A kept `test.only` is warned about: `forbidOnly` fails CI runs while it is there.
- The popup / download / dialog / file-chooser / response patterns Playwright records as three statements become one framework call (`actions.waitForNewTab`, `actions.downloadAndRead`, `dialogs.handleDialogDuring`, `actions.chooseFiles`, ...). A popup or download the recording never uses is not bound to an unused variable.
- Fixed waits, `networkidle` and `page.pause()` are removed - and listed. Anything with no framework wrapper stays as plain, marked Playwright (`// TODO(converter)`), and `--strict` turns that into a failure so it cannot be forgotten.
- Paths are relative to `BASE_URL` (`--keep-host` keeps full URLs). `--test-import` / `--ui-import` point the generated file at your own base test and package.

`recordings/login-flow.spec.ts` is a worked example; `tests/generated/` holds its three conversions, which run in this repo's suite (a test fails if they drift from what the converter produces).

## Locators: `getByRole()` and friends, not CSS/XPath

`import { locators } from '@automation/referenced-automation-ui'`. The point of this layer is to make Playwright's own accessibility-first locators (`getByRole`, `getByText`, `getByLabel`, ...) the path of least resistance, instead of every page object reaching for `page.locator('#some-id')` the way a Selenium-based framework has to. Every function here takes a `Scope` - a `Page`, a `Locator` (to search inside a component's own root), or a `FrameLocator` (to search inside an iframe) - as its first argument, so the exact same call works whether you're searching the whole page or scoping into something narrower.

### `locators.role.*` - one function per ARIA role

```ts
locators.role.button(page, 'Submit')
locators.role.button(page, 'Submit', { exact: true })   // full, case-sensitive match instead of substring
locators.role.button(page, /submit/i)                    // RegExp - matches the pattern, exact is ignored
locators.role.checkbox(page, 'Accept terms', { checked: true })
locators.role.heading(page, 'Welcome', { level: 1 })      // <h1>, or anything with aria-level="1"
locators.role.tab(page, 'Settings', { selected: true })
locators.role.option(page, 'United Kingdom', { exact: true })
locators.role.listitem(frameLocator)                       // no name - matches every item; scoped into an iframe here
```

There's one shorthand for every role Playwright's `getByRole()` itself recognizes (`button`, `checkbox`, `combobox`, `heading`, `link`, `listitem`, `tab`, `textbox`, ... 82 in total) - the full list is `ARIA_ROLES`/`AriaRole` from `locators`, generated straight from Playwright's own role union so it can't drift out of sync. Every shorthand takes the same three things `getByRole()` itself does:

| Argument | Type | Behavior |
|---|---|---|
| `name` (2nd arg) | `string \| RegExp` | A string matches case-insensitively as a substring; a RegExp matches its pattern. Omit it to match every element with that role. |
| `options.exact` | `boolean` | Forces `name` to match the full string, case-sensitively. Ignored when `name` is a RegExp. |
| `options.checked` / `disabled` / `expanded` / `pressed` / `selected` | `boolean` | The matching ARIA state attribute (`aria-checked`, `aria-disabled`, ...). |
| `options.level` | `number` | `aria-level` - heading level, list/tree nesting depth. |
| `options.description` | `string \| RegExp` | Matches the accessible description, same substring/RegExp/exact rules as `name`. |
| `options.includeHidden` | `boolean` | Also matches elements normally excluded from the accessibility tree. |

`locators.byRole(scope, role, options)` is the same thing without the per-role shorthand, for when the role is dynamic/computed rather than a literal you'd type.

### The rest of Playwright's `getBy*` family

```ts
locators.byText(page, 'Invalid credentials')       // visible text content
locators.byLabel(page, 'Password')                 // a form control by its <label> - works even when the control has no useful ARIA role (e.g. input[type=password])
locators.byPlaceholder(page, 'Search...')
locators.byAltText(page, 'Company logo')
locators.byTitle(page, 'Close')                     // title attribute
locators.byTestId(page, 'submit-button')            // data-testid (or playwright.config.ts's testIdAttribute)
```

All but `byTestId` accept the same `{ exact?: boolean }` as `locators.role.*`'s `name`.

**When to still use a raw `page.locator('#id')` or CSS selector:** when the element genuinely has no accessible role, label, text, or test id of its own - a bare `<div>` used as a drag handle, a decorative container. Don't force a role locator onto something that has no real ARIA semantics; `tests/support/DashboardPage.ts` shows both cases side by side (role locators for the interactive controls, a couple of plain CSS locators for two unlabelled `<div>`s used only as drag source/target).

## Assertions: the full `expect()` surface, logged like everything else

`import { assertions } from '@automation/referenced-automation-ui'`. Thin, logged wrappers around Playwright's own auto-retrying `expect(locator)`/`expect(page)` - so a spec reads as one consistent stream of steps instead of mixing `actions.foo()`/`locators.bar()` calls with bare `expect(...)` calls:

```ts
await assertions.toBeVisible(locators.role.heading(page, 'Dashboard'));
await assertions.toHaveValue(locators.role.combobox(page, 'Country'), 'uk');
await assertions.toHaveCount(locators.role.listitem(page), 3);
await assertions.toHaveText(locators.role.listitem(page), ['Item 1', 'Item 2', 'Item 3']);
await assertions.toHaveTitle(page, 'Dashboard - MyApp');
await assertions.not.toBeChecked(locators.role.checkbox(page, 'Subscribe'));
```

| Category | Functions |
|---|---|
| State | `toBeAttached`, `toBeVisible`, `toBeHidden`, `toBeEnabled`, `toBeDisabled`, `toBeChecked`, `toBeEditable`, `toBeEmpty`, `toBeFocused`, `toBeInViewport` |
| Content | `toContainText`, `toHaveText`, `toHaveValue`, `toHaveValues` |
| Attributes/properties/style | `toHaveAttribute` (with or without an expected value - the second form asserts presence only), `toHaveClass`, `toContainClass`, `toHaveCSS`, `toHaveId`, `toHaveJSProperty`, `toHaveCount` |
| Accessibility | `toHaveRole`, `toHaveAccessibleName`, `toHaveAccessibleDescription`, `toHaveAccessibleErrorMessage` |
| Page-level | `toHaveTitle(page, ...)`, `toHaveURL(page, ...)` |
| Negated | `assertions.not.*` - the same names, for the dozen or so most commonly negated cases (`toBeVisible`, `toBeChecked`, `toHaveText`, `toHaveAttribute`, `toHaveCount`, `toHaveTitle`, ...) |

Every function accepts an `options.timeout` to override the assertion timeout for that call. `toHaveScreenshot`/`toMatchAriaSnapshot` (visual/snapshot baselines) and the rarer `signal` (AbortSignal) option aren't wrapped - call `expect(locator)`/`expect(page)` directly for those; nothing here hides or replaces Playwright's real `expect`, these are just the common path made consistent with the rest of the framework's logging.

## Environments, browsers, and devices

Same `.env.<name>` + `ENV=<name>` pattern as the rest of this family (see `referenced-automation-utils`'s README for the full explanation) - with one addition here: `playwright.config.ts` resolves the env file relative to its own location (`__dirname`), not the process's working directory, so the correct `.env.<ENV>` loads identically whether you run tests from a terminal, an IDE's "Run test" button, or a CI job with a different working directory.

Pick the environment and override any option for one run:

```bash
# bash / zsh
ENV=stage BROWSER=firefox HEADLESS=false npx playwright test
```

```powershell
# PowerShell - set, run, then undo (a $env: value stays set for the rest of the terminal session)
$env:ENV = "stage"; $env:BROWSER = "firefox"; $env:HEADLESS = "false"; npx playwright test
Remove-Item Env:ENV; Remove-Item Env:BROWSER; Remove-Item Env:HEADLESS
```

Every option (`BASE_URL`, `HEADLESS`, `BROWSER`, `DEVICE`, `WORKERS`, `RETRIES`, the `*_TIMEOUT_MS` family, `TEST_ID_ATTRIBUTE`, ...) is read from the active `.env.<ENV>` file or the real environment; the full list, with defaults and which are secret, is the [Configuration reference](#configuration-reference). The three committed files (`.env.dev`, `.env.qa`, `.env.stage`) are the starting point; `.env.example` explains every key and `.env.local.example` is the template for the secret file `.env.<ENV>.local`.

### Device emulation

```bash
DEVICE="iPhone 15" npm test        # one specific device
BROWSER=all-devices npm test       # iPhone 15 + Pixel 7 + iPad Pro 11 in parallel
```

```powershell
$env:DEVICE = "iPhone 15"; npm test           # one specific device
Remove-Item Env:DEVICE
$env:BROWSER = "all-devices"; npm test        # iPhone 15 + Pixel 7 + iPad Pro 11 in parallel
Remove-Item Env:BROWSER
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

## Configuration reference

Every environment variable this repo reads, directly or through `createPlaywrightConfig` and the shared utils code. The file `.env.example` documents each one the same way (what it is for, **Read from**, accepted values, default, required, secret, an example); this table is its summary and a test (`tests/envDocs.spec.ts`) fails when the two or the code drift apart.

- **Shared keys** - environment selection, `BASE_URL`, browser and run options, timeouts, logging, `RANDOM_SEED`, `CI`, `TEST_WORKER_INDEX`, `TZ`: the same keys with the same meaning in every repo of the family, read by `referenced-automation-utils`. Their full documentation is the [utils `.env.example`](https://github.com/achaljoshi/referenced-automation-utils/blob/master/.env.example) and the [Configuration reference in the utils README](https://github.com/achaljoshi/referenced-automation-utils#configuration-reference).
- **Repo-specific keys** - the credentials (`UI_*`) and the install / CI keys (`NPM_REGISTRY_URL`, `USE_LOCAL_PACKAGES`, `PLAYWRIGHT_*`, `AUDIT_RUN_GATES`): only this repo.
- utils also reads `REMOTE_*` (remote desktop host), `S3270_PATH` and `TN3270_TIMEOUT_MS` (mainframe); this repo uses none of them.

Where a key is read decides where it can be set. Most are read from the `.env.<ENV>` files **or** the real environment. A few are "real environment only" - `ENV`, `ENVIRONMENT`, the `LOG_*` keys, `NO_COLOR`, `FORCE_COLOR`, `RANDOM_SEED`, `CI`, `TEST_WORKER_INDEX`, `TZ` and the install / CI keys - and a line for them in a `.env` file does nothing:

```bash
# bash / zsh
LOG_LEVEL=debug npx playwright test
```

```powershell
# PowerShell (undo with Remove-Item Env:LOG_LEVEL)
$env:LOG_LEVEL = "debug"; npx playwright test
```

Files load in this order, later wins: `.env`, `.env.<ENV>`, `.env.<ENV>.local`, the real environment. The secret file is named after the environment (`ENV=qa` reads `.env.qa.local`, **not** `.env.local`); create it from the template with `cp .env.local.example .env.qa.local` (PowerShell: `Copy-Item .env.local.example .env.qa.local`). Secrets never go into a committed file.

Gherkin `{{env:NAME}}` and the step `I read the environment variable "NAME" into "var"` read any name you choose (from the files or the real environment), so the credentials below are only the names this repo's own features and the converter use. The converter writes `env.get('UI_<FIELD NAME>')` for a value it recognises as a secret - `UI_` plus the field's name in upper snake case (`UI_PASSWORD`, `UI_API_TOKEN`, `UI_ENTER_PIN`); `.env.example` has the rule, and the command prints the names to set after each conversion.

### Environment and target

| Name | Purpose | Default | Required | Secret |
|---|---|---|---|---|
| `ENV` | Which environment to run against = which `.env.<name>` files load; real environment only | `qa` | no | no |
| `ENVIRONMENT` | Fallback name for `ENV` when another tool owns `ENV`; real environment only | unset (then `qa`) | no | no |
| `BASE_URL` | Base URL of the application under test (`use.baseURL`, so `page.goto('/login')` works) | unset | no for the config; yes for tests that open a relative URL | no |

### Browser and run selection

| Name | Purpose | Default | Required | Secret |
|---|---|---|---|---|
| `BROWSER` | `chromium` \| `firefox` \| `webkit` \| a system channel (`msedge`, `chrome`, ...) \| `all` \| `all-devices` | `chromium` | no | no |
| `DEVICE` | One [Playwright device](https://playwright.dev/docs/emulation#devices) (`"iPhone 15"`, `"Pixel 7"`); wins over `BROWSER` | unset | no | no |
| `HEADLESS` | Run the browser without a window | `true` | no | no |
| `WORKERS` | Test files run at the same time (a number or `50%`) | unset (half of the cores) | no | no |
| `RETRIES` | How often a failed test is run again | `0`; `1` when `CI` is set | no | no |
| `MAX_FAILURES` | Stop the run after this many failures (0 = never) | `0` | no | no |
| `SLOW_MO_MS` | Slow every browser action down by this many milliseconds | `0` | no | no |
| `VIEWPORT_WIDTH` | Desktop window width in pixels (device projects use their preset) | `1280` | no | no |
| `VIEWPORT_HEIGHT` | Desktop window height in pixels | `800` | no | no |
| `LOCALE` | Browser language, e.g. `en-GB` | unset | no | no |
| `TIMEZONE_ID` | Browser time zone, e.g. `Europe/London` | unset | no | no |
| `COLOR_SCHEME` | `light` \| `dark` \| `no-preference` | unset | no | no |
| `IGNORE_HTTPS_ERRORS` | Accept invalid or self-signed certificates (test environments only) | `false` | no | no |
| `TEST_ID_ATTRIBUTE` | The attribute `getByTestId()` looks at | `data-testid` | no | no |

### Timeouts (milliseconds)

| Name | Purpose | Default | Required | Secret |
|---|---|---|---|---|
| `TEST_TIMEOUT_MS` | One whole test | `30000` | no | no |
| `EXPECT_TIMEOUT_MS` | A web-first assertion (`expect`) | `10000` | no | no |
| `ACTION_TIMEOUT_MS` | One action (click, fill, ...) | `15000` | no | no |
| `NAVIGATION_TIMEOUT_MS` | A navigation (`goto`, link clicks) | `30000` | no | no |
| `GLOBAL_TIMEOUT_MS` | The whole run (0 = no limit) | `0` | no | no |

### Logging and test data (real environment only)

| Name | Purpose | Default | Required | Secret |
|---|---|---|---|---|
| `LOG_LEVEL` | Minimum level: `error` \| `warn` \| `info` \| `http` \| `verbose` \| `debug` \| `silly` | `info` | no | no |
| `LOG_TO_FILE` | Also write the JSON-lines log file (`false` turns it off) | `true` | no | no |
| `LOG_FILE` | Where the log file goes | `logs/automation.log` | no | no |
| `LOG_FILE_PER_WORKER` | One log file per Playwright worker | `false` | no | no |
| `NO_COLOR` | Any non-empty value switches coloured console output off | unset | no | no |
| `FORCE_COLOR` | Any non-empty value switches colour on, even in CI or a pipe | unset | no | no |
| `RANDOM_SEED` | Seeds the random-data generators so a run can be replayed | unset (random) | no | no |

### Credentials (repo-specific)

| Name | Purpose | Default | Required | Secret |
|---|---|---|---|---|
| `UI_PASSWORD` | The password the login features (`{{env:UI_PASSWORD}}`) and the generated tests type; also what the converter derives for a field labelled "Password" | unset (this repo's own suite sets a made-up value for its local fixture page) | yes for a login scenario against a real application | YES |
| `UI_BEARER_TOKEN` | A `Bearer ...` value found in a converted recording | unset | only if a converted recording used it | YES |
| `UI_BASIC_CREDENTIAL` | A `Basic ...` value found in a converted recording | unset | only if a converted recording used it | YES |
| `UI_JWT` | A JWT found in a converted recording | unset | only if a converted recording used it | YES |

### Set by the machine

| Name | Purpose | Default | Required | Secret |
|---|---|---|---|---|
| `CI` | Set by CI systems: raises the retries default, forbids `test.only`, keeps all output, switches colour off | unset | no | no |
| `TEST_WORKER_INDEX` | Set by Playwright for each worker; shown as `[w2]` in the log | unset outside a worker | no | no |
| `TZ` | Time zone of the Node process (Node reads it, real environment only) | the machine's own | no | no |

### Install and CI (repo-specific, real environment only)

| Name | Purpose | Default | Required | Secret |
|---|---|---|---|---|
| `NPM_REGISTRY_URL` | The npm registry `setup`, `create-package` and every CI job install from; `publish-package` publishes to it | unset (npm keeps its own registry) | no for setup; yes for `publish-package` and in CI | no |
| `USE_LOCAL_PACKAGES` | `1` installs the `@automation/*` packages from `../shared-packages` (same as `setup --local`) | unset | no | no |
| `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` | `1` skips the browser download (then set `BROWSER` to an installed browser) | unset | no | no |
| `PLAYWRIGHT_DOWNLOAD_HOST` | Mirror to download Playwright's browsers from when the public site is blocked (a GitLab CI/CD variable) | unset | no | no |
| `AUDIT_RUN_GATES` | GitLab CI: on a manual pipeline, makes the `audit` job also run lint, typecheck, test and security | unset | no | no |

## Allure reporting

Every test run writes raw results to `allure-results/` via the `allure-playwright` reporter (pure JS/TS, no extra runtime needed). Turning those into the viewable HTML report needs a JRE on `PATH` (Allure's report generator is a Java tool) - that's why it's a separate step, not part of `npm test` itself:

```bash
npm test               # also writes allure-results/
npm run allure:report  # generates allure-report/ and opens it in a browser
```

Or split the two steps (e.g. to generate in CI and open locally): `npm run allure:generate`, then `npm run allure:open`.

## CI/CD (GitLab)

`.gitlab-ci.yml` runs on every push to `main` (including a merge request being merged), every merge request, and manual "Run pipeline" from the GitLab UI. It uses the Playwright Docker image mirrored into the organisation's Artifactory (`.../common/microsoft/playwright:v1.47.0-jammy`) - only as a Node.js + Ubuntu Jammy base with the OS libraries browsers need, because `mcr.microsoft.com` is not reachable from the restricted network. That image's browsers do not match this repo's Playwright (1.64), so **every job runs `npx playwright install <browser>` itself** after `npm ci` (binaries only, no `--with-deps`); if that download is blocked, set `PLAYWRIGHT_DOWNLOAD_HOST` to an Artifactory mirror (the header of `.gitlab-ci.yml` explains both variables).

Stages: `build` (install, compile, lint, typecheck) → `test` (a `chromium`/`firefox`/`webkit` matrix, plus one separate accessibility job) → `report` (publishes the Allure HTML report to GitLab Pages on `main`).

- The matrix legs run `npx playwright test --project=<browser>` (after `bddgen`) and the Gherkin features run **once**, in their own `bdd` job: the `bdd` project that `createPlaywrightConfig` appends takes no browser from the matrix, so running it in every leg would use a browser that leg did not install.
- `tests/accessibility.spec.ts` runs once, in the `accessibility` job (Chromium); the matrix legs skip it with `--grep-invert @a11y`.

**Packages in CI.** `npm ci` installs `referenced-automation-utils` and `referenced-automation-api` by the versions in `package.json`, from the npm registry in the `NPM_REGISTRY_URL` CI/CD variable (Settings → CI/CD → Variables) - the pipeline neither clones nor builds the sibling repos. Publish a new version of them first (see [Publishing a package](#publishing-a-package-to-the-registry-jfrog-artifactory)), then change the version here (see [Upgrading a package](#upgrading-a-package-change-one-version)).

I don't have a GitLab instance to execute-test this pipeline against directly - the YAML is syntactically valid and the logic was reasoned through carefully, but treat the first real run as the actual verification, the same way you'd want to for any new pipeline.

## Publishing a package to the registry (JFrog Artifactory)

The other repos install `@automation/referenced-automation-ui` **by version** from your organisation's npm registry, so each new version has to be published there. In order:

1. **Know the registry URL.** It is the npm registry URL of your Artifactory - the one in your `~/.npmrc` and in the `NPM_REGISTRY_URL` CI/CD variable. This repo never hard-codes it; ask your platform team if you do not have it.
2. **Be allowed to publish.** Publishing needs an npm identity with deploy permission on that repository. How you authenticate npm against your Artifactory is your organisation's own procedure and is not covered here - the scripts in this repo never log in for you.
3. **Choose the version and record it.** A version can be published only once:
   ```bash
   npm version patch --no-git-tag-version      # or minor / major - changes package.json only
   ```
   Add the change to `CHANGELOG.md` and commit both.
4. **Point the scripts at the registry** (once per terminal):
   ```bash
   export NPM_REGISTRY_URL="<your registry URL>"        # bash / zsh
   ```
   ```powershell
   $env:NPM_REGISTRY_URL = "<your registry URL>"        # PowerShell (cmd.exe: set NPM_REGISTRY_URL=<your registry URL>)
   ```
5. **Publish** - a dry run first:
   ```bash
   ./scripts/publish-package.sh --dry-run     # builds the package and lists what would be uploaded
   ./scripts/publish-package.sh               # uploads it
   ```
   ```powershell
   .\scripts\publish-package.bat --dry-run    # PowerShell (cmd.exe: scripts\publish-package.bat)
   .\scripts\publish-package.bat
   ```
   The script runs `npm config set registry "$NPM_REGISTRY_URL"`, builds with `create-package.sh` (clean, build, `npm pack`) and runs `npm publish <the .tgz> --registry "$NPM_REGISTRY_URL"`.
6. **Check it arrived:** `npm view @automation/referenced-automation-ui versions --registry "$NPM_REGISTRY_URL"` lists the new version.

**Without the script.** `./scripts/create-package.sh` leaves `../shared-packages/automation-referenced-automation-ui-<version>.tgz`, the exact file `npm publish` uploads. Publish that file yourself (`npm publish ../shared-packages/<file>.tgz --registry "$NPM_REGISTRY_URL"`), or deploy the `.tgz` into the npm repository through the Artifactory web UI (the repository's **Deploy** action - Artifactory takes the package name and version from the tarball; check with your platform team how your repository is set up), or hand it to whoever manages the repository.

**Order matters.** Publish what a package depends on first: `utils` -> `api` and `ui` -> `sap` -> the consuming repos.

## Upgrading a package: change one version

This repo lists the `@automation/*` packages it uses in `package.json` with a version range, like any other dependency:

```jsonc
"dependencies": {
  "@automation/referenced-automation-utils": "^1.0.0",
  "@automation/referenced-automation-api": "^1.0.0"
}
```

To take a newer version, **change that number** (say `"^1.3.0"`), run `npm install`, run the tests and commit `package.json` and `package-lock.json`. npm downloads the new version from the registry in `NPM_REGISTRY_URL`; nothing is built, copied or placed by hand.

- `^1.3.0` accepts any `1.x` from 1.3.0 up (what `npm update` moves to); write `1.3.0` to pin exactly.
- `npm ci` (CI, `setup.sh`) installs exactly what the lockfile records, so a version only changes when someone commits a change.
- The lockfile in this repo records the version of each `@automation/*` package but not where it came from. The first `npm install` against the real registry adds that (`resolved` and `integrity`); commit the result.
- A package that is itself depended on (`utils`, `api`, `ui`, `sap`) must be published again before its consumers can ask for the new version - see [Publishing a package](#publishing-a-package-to-the-registry-jfrog-artifactory) in that repo.

## First rollout: publish, then install from the registry

To see the whole chain work from the registry (no `--local`): set `NPM_REGISTRY_URL`, publish `utils`, `api`, `ui`, `sap` **in that order** (`./scripts/publish-package.sh --dry-run`, then without `--dry-run`, in each repo; the first publish uses the current version, 1.0.0), confirm with `npm view @automation/referenced-automation-<name> versions --registry "$NPM_REGISTRY_URL"`, then in a consumer delete `node_modules` and run `./scripts/setup.sh` (PowerShell: `Remove-Item -Recurse -Force node_modules` and then `.\scripts\setup.bat`) and check `npm ls @automation/referenced-automation-utils` and the `resolved` address in `package-lock.json`. The full walkthrough is [section 4.3 of the cross-repo guide](https://github.com/achaljoshi/referenced-automation-utils/blob/master/CROSS_REPO_GUIDE.md#43-first-rollout-publish-everything-then-install-from-the-registry).

## Using a package without a registry (local generation)

Use this when the packages are not in a registry yet, or you want to try a change before publishing it. Nothing in `package.json` or the lockfile changes.

**Automatic - when the repos are checked out next to each other:**

```bash
./scripts/setup.sh --local          # bash / zsh
```

```powershell
.\scripts\setup.bat --local         # PowerShell (cmd.exe: scripts\setup.bat --local)
```

It builds the sibling repos this one depends on (`referenced-automation-utils`, `referenced-automation-api`) with their own `scripts/create-package.sh --local`, keeps the `.tgz` files in `../shared-packages` and installs them.

**Manual - generating a tarball and placing it yourself** (for example when the consuming repo is on another machine):

1. Generate a tarball of each package this repo needs, in that package's own repo (`--local` builds what it depends on in turn, without needing the registry):
   ```bash
   (cd ../referenced-automation-utils && ./scripts/create-package.sh --local)
   (cd ../referenced-automation-api && ./scripts/create-package.sh --local)
   ```
   ```powershell
   cd ..\referenced-automation-utils
   .\scripts\create-package.bat --local
   cd ..\referenced-automation-api
   .\scripts\create-package.bat --local
   cd ..\referenced-automation-ui
   ```
   Each file is named `automation-<package>-<version>.tgz` after the version in that repo's `package.json` and lands in `../shared-packages`.
2. Leave the files in `../shared-packages`, or copy them into the consuming repo (any folder works, for example `libs/` - keep it out of git).
3. Install them, all in one command (change the folder if you copied the files elsewhere):
   ```bash
   npm install --no-save ../shared-packages/automation-referenced-automation-utils-<version>.tgz ../shared-packages/automation-referenced-automation-api-<version>.tgz
   ```
   `--no-save` keeps `package.json` and the lockfile unchanged. Run it again after every `npm ci`, because `npm ci` removes what is not in the lockfile. When you rebuild a tarball with the same version, run the command again to pick up the new contents.
4. Build and test as usual (`npm run build`, `npm test`).

When you are done experimenting, run `npm ci` to go back to what the registry provides.

## IDE setup

Same as the other repos in this family: VS Code prompts for recommended extensions on open (Playwright Test, ESLint, Prettier); IntelliJ/WebStorm ships ESLint/Prettier wired in plus `npm: test` / `npm: test:smoke` run configurations. Node.js/TypeScript/Playwright support is bundled with WebStorm/IntelliJ Ultimate - nothing to install.

## Testing this package itself

`tests/support/fixture.html` is a small, self-contained local page (login form, dropdown, checkbox, drag-and-drop, an iframe, a popup trigger, a download link, a file input) opened via a `file://` URL - deliberately not a live third-party site, so the suite is fast, deterministic, and has no external network dependency.

`tests/support/` is also the working example of [the page object/component/fixture pattern above](#structuring-page-objects-components-and-fixtures): `LoginPage.ts` and `DashboardPage.ts` are real page object factory functions (one page each, `loginAs()` returns the next page), `components/FileUploadWidget.ts` is a real component factory function, and `fixtures.ts` wires both pages up as Playwright fixtures - `demo.spec.ts` and `accessibility.spec.ts` consume them exactly the way a consuming project's own specs would. `accessibility.spec.ts` runs axe-core against the same fixture - properly labelled form controls and a titled iframe, on purpose, so the "no violations" assertions are actually meaningful rather than trivially true. `locatorsAndAssertions.spec.ts` is the working reference for `locators`/`assertions` themselves.

Two more spec files cover what a consuming project imports from this framework's dependencies: `utilsMethods.spec.ts` is only a thin import check that the utils pieces this package builds on resolve and work (utils tests its own methods in its own repo, and the check is not tagged `@smoke`), and `apiIntegration.spec.ts` demos `MockServer` and `mockApiRoute` from `@automation/referenced-automation-api` - the latter is a devDependency only (see `scripts/setup.sh`), not part of what this package ships.
