# referenced-automation-ui

Reusable Playwright UI automation framework: a `BasePage` action layer covering navigation, element interaction, waits, frames, new tabs, downloads/uploads, and network mocking. Extend it, provide locators and input values - no raw Playwright boilerplate per page object, and every action is logged (console + `logs/automation.log` + Playwright's own step/trace report) automatically.

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
import { BasePage } from '@automation/referenced-automation-ui';
import type { Page } from '@playwright/test';

class LoginPage extends BasePage {
  private readonly username = this.page.locator('#username');
  private readonly password = this.page.locator('#password');
  private readonly submit = this.page.locator('#login-button');

  constructor(page: Page) {
    super(page);
  }

  async loginAs(username: string, password: string) {
    await this.fill(this.username, username);
    await this.fill(this.password, password);
    await this.click(this.submit);
  }
}
```

## What's included

| Capability | Methods |
|---|---|
| Navigation | `goto`, `reload`, `goBack`, `goForward`, `currentUrl`, `title` |
| Actions | `click`, `dblClick`, `rightClick`, `fill`, `type` (real keystrokes), `clear`, `check`, `uncheck`, `selectOption`, `hover`, `dragAndDrop`, `pressKey`, `focus`, `uploadFile` |
| Reads | `getText`, `getValue`, `getAttribute`, `isVisible`, `isEnabled`, `isChecked`, `count`, `allText` |
| Explicit waits | `waitForVisible`, `waitForHidden`, `waitForUrlContains`, `waitForLoadState`, `waitForResponseMatching` (Playwright's Locator API auto-waits on every action above already - these cover the conditions that don't) |
| Screenshots | `screenshotPage`, `screenshotElement` (automatic on-failure screenshots are configured in `playwright.config.ts`, not something you call yourself) |
| Frames | `frame(selector)` returns a `FrameLocator` scoped inside an iframe |
| New tabs/popups | `waitForNewTab(action)` |
| Downloads | `downloadFile(action, savePath)` |
| Uploads | `uploadFile(locator, filePaths)` |
| Network mocking | `mockRoute(pattern, response)`, `blockRoute(pattern)`, `unrouteAll` |
| Step visibility | Every action above is wrapped in both `test.step()` (Playwright's HTML report/trace viewer) and the shared logger (console + `logs/automation.log`, visible in CI job logs) - see `src/base/step.ts` |

## Environments and browsers

Same `.env.<name>` + `ENV=<name>` pattern as the rest of this family (see `referenced-automation-utils`'s README for the full explanation). `playwright.config.ts` also reads `BASE_URL`, `HEADLESS`, and `BROWSER` (`chromium` | `firefox` | `webkit` | `all`) from the active env file:

```bash
ENV=stage BROWSER=firefox HEADLESS=false npx playwright test
```

## Distributing this package

```bash
./scripts/create-package.sh   # writes ../shared-packages/referenced-automation-ui-<version>.tgz
```

## IDE setup

Same as the other repos in this family: VS Code prompts for recommended extensions on open (Playwright Test, ESLint, Prettier); IntelliJ/WebStorm ships ESLint/Prettier wired in plus `npm: test` / `npm: test:smoke` run configurations. Node.js/TypeScript/Playwright support is bundled with WebStorm/IntelliJ Ultimate - nothing to install.

## Testing this package itself

`tests/support/fixture.html` is a small, self-contained local page (login form, dropdown, checkbox, drag-and-drop, an iframe, a popup trigger, a download link, a file input) opened via a `file://` URL - deliberately not a live third-party site, so the suite is fast, deterministic, and has no external network dependency. `tests/support/DemoPage.ts` is a real page object built on `BasePage`, exercising every capability in the table above.
