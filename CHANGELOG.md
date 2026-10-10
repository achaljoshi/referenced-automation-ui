# Changelog

## Unreleased

### Changed
- **`@automation/*` dependencies are version ranges (`^1.0.0`)**, installed from the registry in `NPM_REGISTRY_URL` (`setup` runs `npm config set registry` first); `setup.sh --local` installs locally built tarballs instead; `scripts/publish-package.sh|.bat` publishes this package. The pipeline no longer clones sibling repos. README: publishing, upgrading, local generation.

### Fixed (audit 2026-10-10)
- **SEC-01** Typed secrets no longer reach step titles, logs or reports. `actions.fill` / `type` / `typeOnPage` / `fillForm` mask the value as `***` (title, log line, error text) for password inputs, secret-looking fields and `{ secret: true }`; Gherkin `{{env:...}}` values are always secret. A secret is entered through the page because Playwright's own `Fill "<value>"` step would print it. New `SecretOption` and `StepOptions.redact`.
- **SEC-05** The codegen converter applies the secret treatment to every literal sink (keystrokes, cookies, extra headers, browser options, URL tokens, evaluated code, the expected value of a password field), keeps `test.skip` / `fixme` / `fail` / `only` (own or from `describe`), and its header no longer claims secrets are never written. `tests/generated/` regenerated (header only).
- **UI-01** State reads swallow only the timeout; strict-mode violations, closed pages and invalid selectors throw. README steers "assert absent" to `assertions.not.*` / `toBeHidden` instead of `{ timeout: 0 }`.
- **UI-02** `dialogs.handleDialogDuring` removes only its own listener, clears its timer and no longer leaves an unhandled rejection after a failed action; it coexists with `recordDialogs`.
- **UI-03** BDD `I should not see "..."` fails if ANY match is visible (and `I should see` accepts any visible match); `performance.expectWithinBudget` fails for a budgeted metric the browser did not report.
- **U8** The negative screenshot test has its own baseline (`red-swatch-expected-mismatch.png`).
- **U9** `pageAs` records video per `use.video` and applies `baseURL`; `trackNetwork().find` strings are exact (or globs); `routeFromHar({ update: true })` warns, records `minimal`, and `network.sanitizeHar(file)` masks credentials in a HAR; `tests/utilsMethods.spec.ts` is a thin import check, no longer `@smoke`.
- **CI** The `bdd` project runs once in its own job (Chromium); matrix legs run `--project=$BROWSER`; the accessibility spec (`@a11y`) runs once; `npm run typecheck` is in the build job. README CI section now matches `.gitlab-ci.yml` (Artifactory mirror image v1.47.0-jammy, `npx playwright install` in every job).

### Changed (behaviour)
- **Stricter defaults** (packages are unpublished at 1.0.0): state reads throw on strict-mode violations, closed pages and bad selectors instead of answering `false`; `trackNetwork().find('fragment')` no longer matches by substring (use `'**/fragment'` or a RegExp); `expectWithinBudget` fails on an unreported budgeted metric; `I should not see` needs every match hidden; secrets are masked in step titles and logs and entered via the page.
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
