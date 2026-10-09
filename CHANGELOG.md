# Changelog

## Unreleased

### Changed (behaviour)
- **State reads now wait.** `isVisible`, `isEnabled`, `isChecked`, `count` and `allText` wait up to the expect timeout for the state; pass `{ timeout: 0 }` to read it instantly (needed to assert something is NOT shown). Previously they returned the instantaneous state.
- The scenario banner is an **auto fixture** rather than a module-level `test.beforeEach`: importing the fixtures has no side effects (tools like `bddgen` import them outside a test run), and the banner applies only to tests that use this `test`.

### Removed
- The `networkidle` option from page actions.

### Added
- ESLint errors on `waitForTimeout` and `'networkidle'`; `tests/noWaits.spec.ts` proves it against a late-rendering page.
- Auto `correlationId` fixture; shared Playwright config; `typecheck` and `security` scripts and job.
