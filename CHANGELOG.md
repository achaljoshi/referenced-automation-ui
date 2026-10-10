# Changelog

## Unreleased

### Changed (behaviour)
- **State reads now wait.** `isVisible`, `isEnabled`, `isChecked`, `count` and `allText` wait up to the expect timeout for the state; pass `{ timeout: 0 }` to read it instantly (needed to assert something is NOT shown). Previously they returned the instantaneous state.
- The scenario banner is an **auto fixture** rather than a module-level `test.beforeEach`: importing the fixtures has no side effects (tools like `bddgen` import them outside a test run), and the banner applies only to tests that use this `test`.

### Removed
- The `networkidle` option from page actions.

### Added
- **BDD (`playwright-bdd` 9.2.1, pinned)**: `registerUiSteps` (open, click / fill / select / check by role, label and visible text, tabs, dialogs, downloads, uploads, drag and drop, viewport, dark mode, mocked and blocked requests, clock; see, not see, value, state, title, URL, accessibility, screenshot; remember text), `registerDataSteps` (variables, random data, dates, env), `{{placeholders}}` everywhere, `vars` and `uiScenario` fixtures, a `bdd` project and sample features in `features/`, `npm run test:bdd`. There is no "I wait N seconds" step.
- **`ui-codegen-to-playwright`**: converts what `npx playwright codegen` records (the `playwright-test` TypeScript output or the `library` JavaScript output, parsed with the TypeScript AST) into tests that use `actions`, `locators`, `assertions`: roles, labels, frames, popups, downloads, dialogs, file choosers, responses. Typed passwords/tokens/PINs come from the environment; `waitForTimeout`, `networkidle` and `pause` are removed; unused bindings are dropped; anything with no wrapper is kept as marked Playwright (`--strict` fails on it). The converted test starts with a `CONSTANTS` object (URLs, every typed value, every expected text/URL/count; secrets as environment getters) and a `LOCATORS` object (every element, named once) and its steps only refer to them, so a changed input or page is one edit at the top (`--inline` writes them in the steps instead). `--page-objects` exports both objects from the top of the page object file; `--data` makes typed values CSV columns, one test per row.
- **Locators**: `byCss`, `byXpath`, `filterBy`, `either`, `both`, `within`, `nth`, `all`, `frameChain`, `frameBy`, tables (`rowWithText`, `cellInRow`, `readTable`).
- **Actions**: `setChecked`, `selectText`, `scrollIntoView`, `dispatchEvent`, `blur`, `tap`, `clickWithModifiers`, `clickAt`, `canClick`, `uploadFromMemory`, `clearFiles`, `chooseFiles`, `pressOnPage`, `typeOnPage`, `moveMouse`, `dragBy`, `scrollWheel`, `scrollPageTo`, `fillForm` (by label), `downloadAndRead`.
- **New modules**: `dialogs`, `network` (JSON/status mocks, edit real responses and requests, block by type, HAR, WebSocket, offline, extra headers, throttling, `trackNetwork`), `storage` (cookies, web storage, saved state, `pageAs`), `emulation`, `clock`, `tabs`, `evaluate` (and browser-API mocks), `visual`, `performance` (timing, web vitals, budgets), `guardPage`.
- **Assertions**: `toHaveScreenshot`, `toMatchAriaSnapshot`, `softly(...)` (soft assertions across every wrapper), `eventually`, `pollValue`.
- **Fixtures**: `vars`, `pageGuard` (+ `failOnPageProblems`, `pageProblemsIgnore`, and `guardedTest`), `pageAs`, `uiScenario`.
- `docs/PLAYWRIGHT_COVERAGE.md`: Playwright's browser capabilities against the framework, with the gaps this round closed.
- ESLint errors on `waitForTimeout` and `'networkidle'`; `tests/noWaits.spec.ts` proves it against a late-rendering page.
- Auto `correlationId` fixture; shared Playwright config; `typecheck` and `security` scripts and job.
