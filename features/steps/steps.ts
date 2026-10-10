import { createBdd } from 'playwright-bdd';
import { registerDataSteps, registerUiSteps } from '../../src/bdd';
import { test } from './fixtures';

// The vocabulary shared by every project ("I click the button ...", "I should see the heading ...", "I set the variable ...")
// lives in the package. Add this project's own steps below, using the same Given/When/Then.
const { Given, When, Then } = createBdd(test);
registerDataSteps({ Given, Then });
registerUiSteps({ Given, When, Then });
