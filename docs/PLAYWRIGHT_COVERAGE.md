# Playwright (browser): what the framework covers

Read against the Playwright documentation (intro, writing tests, actions, locators, assertions, auto-waiting, network,
mocking, authentication, frames, dialogs, downloads, pages, events, clock, emulation, screenshots, ARIA snapshots,
visual comparisons, evaluating, annotations, parameterization, best practices). For every capability: **has** (was
already here), **added** (the gap this round closed), **native** (use Playwright's own - nothing to wrap), or
**not wrapped** (deliberately, with the reason).

## Locators

| Playwright | Framework | |
|---|---|---|
| `getByRole` (all options) | `locators.role.<role>(scope, name, options)` for every ARIA role; `locators.byRole` | has |
| `getByText/Label/Placeholder/AltText/Title/TestId` | `locators.byText` ... `byTestId` | has |
| `locator('css=...')`, `locator('xpath=...')` | `locators.byCss`, `locators.byXpath` | **added** |
| `filter({ hasText, hasNotText, has, hasNot, visible })` | `locators.filterBy(locator, options)` | **added** |
| `and()`, `or()`, `within()` | `locators.both`, `locators.either`, `locators.within` | **added** |
| `first()`, `last()`, `nth()`, `all()` | `locators.nth`, `locators.all`; `.first()` / `.last()` on the Locator itself | **added** / native |
| `frameLocator()`, nested frames, `page.frame()` | `locators.frameChain(page, ['#outer', '#inner'])`, `locators.frameBy` | **added** |
| Tables (no built-in) | `locators.rowWithText`, `cellInRow`, `readTable` (array of objects keyed by header) | **added** |
| Shadow DOM | native: locators pierce open shadow roots | native |
| `testIdAttribute` | `TEST_ID_ATTRIBUTE` in `.env` (shared config) | has |

## Actions

| Playwright | Framework | |
|---|---|---|
| click, dblclick, right-click, fill, type, clear, check, uncheck, selectOption, hover, drag and drop, press, focus, upload | `actions.*` | has |
| `setChecked`, `selectText`, `scrollIntoViewIfNeeded`, `dispatchEvent`, `blur`, `tap` | `actions.setChecked` ... `tap` | **added** |
| click with modifiers / at a position / `trial` | `clickWithModifiers`, `clickAt`, `canClick` (a dry run) | **added** |
| Files from memory, clearing files, dynamic file choosers | `uploadFromMemory`, `clearFiles`, `chooseFiles` | **added** |
| Keyboard and mouse at page level, wheel, scrolling | `pressOnPage`, `typeOnPage`, `moveMouse`, `dragBy`, `scrollWheel`, `scrollPageTo` | **added** |
| Whole forms | `actions.fillForm(page, { 'First name': 'Ada', Country: 'UK', Subscribe: true })` by label | **added** |
| Auto-waiting / actionability | native - the actions never sleep; `actions.isVisible` etc. WAIT (see No waits) | has |
| `waitForTimeout` | **not provided, on purpose**: lint bans it, the converter removes it | - |

## Page, navigation, tabs

| Playwright | Framework | |
|---|---|---|
| goto, reload, back, forward, title, URL, load state, waitForURL, waitForResponse | `actions.*` | has |
| Popups / new tabs | `actions.waitForNewTab`, `tabs.waitForNewPage`, `tabs.findTab`, `switchToTab`, `closeOtherTabs`, `openNewPage` | has / **added** |
| Downloads | `actions.downloadFile`; `actions.downloadAndRead` (names it, fails on a failed download, reads text/json/bytes) | has / **added** |
| Dialogs (alert, confirm, prompt, beforeunload) | `dialogs.handleDialogDuring`, `recordDialogs`, `closeRunningUnloadHandlers` | **added** |
| `page.evaluate`, `waitForFunction`, `addInitScript`, `exposeFunction` | `evaluate.*` | **added** |
| Mocking browser APIs | `mockNavigatorProperty`, `stubWindowOpen`, `mockClipboard` | **added** |
| Clock | `clock.installClock`, `setFixedTime`, `pauseClockAt`, `fastForward`, `runClockFor`, `resumeClock` | **added** |

## Network

| Playwright | Framework | |
|---|---|---|
| `page.route` fulfil / abort | `actions.mockRoute`, `blockRoute`, `unrouteAll` | has |
| JSON mocks with status / method / times / delay | `network.mockJson`, `mockStatus` | **added** |
| Edit a real response / request | `network.modifyJsonResponse`, `modifyRequest` (composes with other handlers) | **added** |
| Block by resource type | `network.blockResources({ types: ['image', 'font'], urls })` | **added** |
| HAR record / replay | `network.routeFromHar` | **added** |
| WebSocket mocking | `network.mockWebSocket` | **added** |
| `waitForRequest` / `waitForResponse`, request and response together | `network.waitForRequestMatching`, `captureApiCall` | **added** |
| Offline, extra headers, throttling | `network.setOffline`, `setExtraHeaders`, `throttleNetwork` (Chromium) | **added** |
| What the page requested, what failed | `network.trackNetwork(page)` -> `find`, `failures`, `errorResponses`, `expectNoErrors`, `waitUntilQuiet` | **added** |

## Browser state, emulation, auth

| Playwright | Framework | |
|---|---|---|
| `storageState`, setup project | `createPlaywrightConfig({ auth })`; `storage.saveStorageState` | has / **added** |
| A second signed-in user in one test | `pageAs(storageStateFile)` fixture, `storage.pageAs` | **added** |
| Cookies, localStorage, sessionStorage | `storage.getCookie/addCookie/clearCookies`, `get/set/clearLocalStorage`, `get/setSessionStorage` | **added** |
| sessionStorage across contexts (not in storage state) | `storage.saveSessionStorage` / `restoreSessionStorage` | **added** |
| Viewport, media (dark mode, reduced motion, print), geolocation, permissions | `emulation.*` | **added** |
| Locale, timezone, device, per-context options | `emulation.newPageWith(browser, { locale, timezoneId, device })`; `BROWSER` / `DEVICE` / `LOCALE` / `TIMEZONE_ID` in the shared config | has / **added** |

## Assertions and evidence

| Playwright | Framework | |
|---|---|---|
| Locator and page assertions | `assertions.*` (and `assertions.not.*`) - logged | has |
| `toHaveScreenshot` | `assertions.toHaveScreenshot(target, name, { mask, maxDiffPixels, ... })` - animations frozen, caret hidden by default | **added** |
| `toMatchAriaSnapshot`, `ariaSnapshot()` | `assertions.toMatchAriaSnapshot`, `visual.ariaSnapshot` | **added** |
| `expect.soft` | `assertions.softly(async () => { ... })` - covers every wrapper in the module | **added** |
| `expect.poll`, `toPass` | `assertions.pollValue`, `assertions.eventually` | **added** |
| Accessibility (axe) | `checkAccessibility`, `expectNoAccessibilityViolations` | has |
| Console errors, page errors, failed requests | `guardPage(page)`; `pageGuard` fixture (attached to the report; fatal with `failOnPageProblems`); `guardedTest` | **added** |
| Screenshots, PDF, determinism for screenshots | `visual.capture`, `savePdf` (Chromium), `stabilizeForScreenshot` | **added** |
| Performance (no Playwright API) | `performance.navigationTiming`, `webVitals`, `expectWithinBudget` | **added** |
| Trace, video, screenshot on failure, reports | `createPlaywrightConfig` | has |

## Test structure

| Playwright | Framework | |
|---|---|---|
| Fixtures, page objects (POM) | plain factory functions; fixtures in `tests/support/fixtures.ts`; see README | has |
| Annotations, tags, `--grep` | native (`@smoke`, `@regression` in titles; converters add `@ui`) | native |
| Parameterized tests | `for` loops + `csvUtils`; Gherkin `Scenario Outline`; converter `--data` | has / **added** |
| Gherkin | `registerUiSteps`, `registerDataSteps` (playwright-bdd 9.2.1); sample features in `features/` | **added** |
| Codegen (record and play) | `ui-codegen-to-playwright` converts the recording into framework-style tests that start with `CONSTANTS` (values) and `LOCATORS` (elements) objects | **added** |
| Debugging (`page.pause`, UI mode) | native; the converter removes `page.pause()` from recordings | native |

## Not wrapped, and why

- **`page.waitForTimeout`, `waitForLoadState('networkidle')`**: guesses. The converter removes them and says so.
- **`locator.waitFor`, `page.waitForSelector`**: use an assertion - `assertions.toBeVisible` waits and reports better.
- **Component testing (`@playwright/experimental-ct-*`)**: a different runner with its own mounting; out of scope here.
- **Electron, Android, WebView2, browser extensions**: separate Playwright surfaces, not part of the web UI framework.
- **Visual baselines for text**: they differ by OS and browser build. Generate them where CI runs (the Playwright
  container) and commit those; this repo's own baselines are solid colours so they are the same everywhere.
