import { defineConfig, devices } from '@playwright/test';
import { loadEnv } from '@automation/referenced-automation-utils';

// Resolve .env.<ENV> relative to this file, not process.cwd() - an IDE's
// "Run test" button can spawn the test process from a different working
// directory than a terminal would, and without this, that run would
// silently load no env file (falling back to hardcoded defaults) instead
// of the same .env.<ENV> a CLI run picks up. This is what actually
// guarantees "pick up the right env file no matter how the test was
// started", not just setting ENV in a shell.
const env = loadEnv({ dir: __dirname });

const headless = env.getBoolean('HEADLESS', true);
const requestedBrowser = env.get('BROWSER', 'chromium');
const requestedDevice = env.getOptional('DEVICE'); // any key from Playwright's `devices`, e.g. "iPhone 15", "Pixel 7", "iPad Pro 11"

// ---- timeouts - every one independently tunable per environment via env
// vars, because "how slow is slow" genuinely differs between a fast local
// API-mocked run and a real cross-region staging environment. ----
const testTimeoutMs = env.getInt('TEST_TIMEOUT_MS', 30_000);
const expectTimeoutMs = env.getInt('EXPECT_TIMEOUT_MS', 10_000);
const actionTimeoutMs = env.getInt('ACTION_TIMEOUT_MS', 15_000);
const navigationTimeoutMs = env.getInt('NAVIGATION_TIMEOUT_MS', 30_000);
const globalTimeoutMs = env.getInt('GLOBAL_TIMEOUT_MS', 0); // 0 = no whole-run cap

// ---- execution shape ----
const workers = env.getOptional('WORKERS'); // e.g. "4", or "50%" - left as a string, Playwright parses both
const retries = env.getInt('RETRIES', process.env.CI ? 1 : 0);
const maxFailures = env.getInt('MAX_FAILURES', 0); // 0 = never fail-fast
const slowMoMs = env.getInt('SLOW_MO_MS', 0); // >0 to visually debug locally, e.g. SLOW_MO_MS=250

// ---- browser context behaviour ----
const locale = env.getOptional('LOCALE');
const timezoneId = env.getOptional('TIMEZONE_ID');
const colorScheme = env.getOptional('COLOR_SCHEME') as 'light' | 'dark' | 'no-preference' | undefined;
const ignoreHTTPSErrors = env.getBoolean('IGNORE_HTTPS_ERRORS', false);
const viewportWidth = env.getInt('VIEWPORT_WIDTH', 1280);
const viewportHeight = env.getInt('VIEWPORT_HEIGHT', 800);

// Chromium-family "channels" launch a real, already-installed browser
// (system Chrome/Edge) instead of Playwright's own bundled binary - the
// way to run this framework on a machine where `playwright install` can
// never reach the internet to download browsers. Firefox/WebKit have no
// such option; Playwright always needs its own build for those.
const SYSTEM_BROWSER_CHANNELS = ['msedge', 'msedge-beta', 'msedge-dev', 'chrome', 'chrome-beta', 'chrome-dev'];

const desktopViewport = { width: viewportWidth, height: viewportHeight };

const desktopProjects = [
  { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: desktopViewport } },
  { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: desktopViewport } },
  { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: desktopViewport } },
  ...SYSTEM_BROWSER_CHANNELS.map((channel) => ({
    name: channel,
    use: { ...devices['Desktop Chrome'], viewport: desktopViewport, channel },
  })),
];

// A representative phone/tablet per OS, selectable via DEVICE=<name>. Not
// limited to this list - DEVICE accepts any of Playwright's 200+ device
// presets (see `npx playwright docgen` or the `devices` export) by exact
// name; these three are just what run by default under BROWSER=all-devices.
const DEVICE_PROJECT_NAMES = ['iPhone 15', 'Pixel 7', 'iPad Pro 11'];
const deviceProjects = (requestedDevice ? [requestedDevice] : DEVICE_PROJECT_NAMES)
  .filter((name) => {
    if (devices[name]) return true;
    console.warn(`Unknown Playwright device "${name}" - skipping. See devices.json for valid names.`);
    return false;
  })
  .map((name) => ({ name, use: { ...devices[name] } }));

const allProjects = [...desktopProjects, ...deviceProjects];

function resolveProjects() {
  if (requestedDevice) {
    // DEVICE picks a device preset outright - it already fixes browser
    // engine/viewport/UA, so BROWSER is not applied on top of it.
    return deviceProjects;
  }
  if (requestedBrowser === 'all') {
    return desktopProjects.slice(0, 3); // the three bundled-browser projects only
  }
  if (requestedBrowser === 'all-devices') {
    return deviceProjects;
  }
  return allProjects.filter((project) => project.name === requestedBrowser);
}

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',

  fullyParallel: true,
  workers,
  retries,
  maxFailures: maxFailures || undefined,
  globalTimeout: globalTimeoutMs || undefined,
  timeout: testTimeoutMs,

  // Never let an accidentally-committed `.only` slip through in CI.
  forbidOnly: !!process.env.CI,
  // Keep only failure artifacts around locally; CI always wants the full
  // set for later download regardless of pass/fail (e.g. to compare runs).
  preserveOutput: process.env.CI ? 'always' : 'failures-only',
  // Flags any test taking >2x its own timeout as suspicious, without
  // failing it - visible in the report as a signal something regressed
  // performance-wise even though the test still technically passed.
  reportSlowTests: { max: 10, threshold: testTimeoutMs * 2 },

  expect: {
    timeout: expectTimeoutMs,
  },

  metadata: {
    framework: '@automation/referenced-automation-ui',
    env: env.envName,
  },

  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    // Raw results only - generating the viewable HTML report is a separate
    // step (`npm run allure:report`) since it needs a JRE on PATH, unlike
    // collecting results here which is pure JS/TS.
    ['allure-playwright', { resultsDir: 'allure-results' }],
  ],

  use: {
    baseURL: env.getOptional('BASE_URL'),
    headless,

    // Auto-wait/retry budgets - independent of the per-test `timeout`
    // above, which bounds the whole test, not a single click/goto.
    actionTimeout: actionTimeoutMs,
    navigationTimeout: navigationTimeoutMs,

    // Debugging/CI artifacts - always collect a trace on first retry so a
    // flaky failure is diagnosable without having to reproduce it live.
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',

    ignoreHTTPSErrors,
    locale,
    timezoneId,
    colorScheme,

    launchOptions: {
      slowMo: slowMoMs || undefined,
    },

    // Lets `page.getByTestId()` match whatever attribute this app's
    // components actually use, without every test hardcoding a selector.
    testIdAttribute: env.get('TEST_ID_ATTRIBUTE', 'data-testid'),
  },

  // BROWSER=chromium|firefox|webkit|<a system channel>|all|all-devices
  // picks the desktop side; DEVICE=<any Playwright device name> picks a
  // phone/tablet emulation project instead (overrides BROWSER when set).
  projects: resolveProjects(),
});
