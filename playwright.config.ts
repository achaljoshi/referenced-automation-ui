import { defineConfig, devices } from '@playwright/test';
import { loadEnv } from '@automation/referenced-automation-utils';

const env = loadEnv();
const headless = env.getBoolean('HEADLESS', true);
const requestedBrowser = env.get('BROWSER', 'chromium');

// Chromium-family "channels" launch a real, already-installed browser
// (system Chrome/Edge) instead of Playwright's own bundled binary - the
// way to run this framework on a machine where `playwright install` can
// never reach the internet to download browsers. Firefox/WebKit have no
// such option; Playwright always needs its own build for those.
const SYSTEM_BROWSER_CHANNELS = ['msedge', 'msedge-beta', 'msedge-dev', 'chrome', 'chrome-beta', 'chrome-dev'];

const allProjects = [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ...SYSTEM_BROWSER_CHANNELS.map((channel) => ({
    name: channel,
    use: { ...devices['Desktop Chrome'], channel },
  })),
];

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: env.getOptional('BASE_URL'),
    headless,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  // BROWSER=chromium|firefox|webkit|<a channel above> picks one project;
  // BROWSER=all runs the three bundled-browser projects (not the system
  // channels - those are for machines that can't have bundled browsers
  // installed at all, not for routine cross-browser coverage).
  projects:
    requestedBrowser === 'all'
      ? allProjects.slice(0, 3)
      : allProjects.filter((project) => project.name === requestedBrowser),
});
