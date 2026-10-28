import { createBdd } from 'playwright-bdd';
import { mockApiRoute } from '@automation/referenced-automation-api';
import { actions } from '../../src';
import { test } from './fixtures';

// Steps for pages that call a backend: a real mock server, or the browser answering the call itself.
// @automation/referenced-automation-api is a devDependency of this repo only (it is not part of what this package ships).
const { Given, When } = createBdd(test);

Given('a mock backend answers GET {string} with JSON:', async ({ mockBackend, vars }, path: string, docString: string) => {
  // The page and the backend are on different ports, so the page's fetch is cross-origin: without this header the browser
  // blocks the page from reading the (successful) response and it stays on "loading...".
  mockBackend.get(vars.interpolate(path), vars.interpolateDeep(JSON.parse(docString)), { headers: { 'Access-Control-Allow-Origin': '*' } });
});

Given('the browser answers GET {string} with JSON:', async ({ uiScenario, vars }, url: string, docString: string) => {
  await mockApiRoute(uiScenario.page, { url: vars.interpolate(url), method: 'GET', body: vars.interpolateDeep(JSON.parse(docString)) });
});

When('I open the profile page that reads {string} from the mock backend', async ({ uiScenario, profileSite, mockBackend, vars }, path: string) => {
  const api = encodeURIComponent(`${mockBackend.baseUrl}${vars.interpolate(path)}`);
  await actions.goto(uiScenario.page, `${profileSite.baseUrl}/profile.html?api=${api}`);
});

When('I open the profile page that reads {string}', async ({ uiScenario, profileSite, vars }, url: string) => {
  await actions.goto(uiScenario.page, `${profileSite.baseUrl}/profile.html?api=${encodeURIComponent(vars.interpolate(url))}`);
});
