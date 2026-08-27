import type { Locator } from '@playwright/test';
import type { Scope, TextMatchOptions } from './types';

/** getByText - matches visible text content. A string matches case-insensitively as a substring; a RegExp matches its pattern; `exact: true` forces a full case-sensitive match. */
export function byText(scope: Scope, text: string | RegExp, options?: TextMatchOptions): Locator {
  return scope.getByText(text, options);
}

/** getByLabel - matches a form control by its associated `<label>` text. */
export function byLabel(scope: Scope, text: string | RegExp, options?: TextMatchOptions): Locator {
  return scope.getByLabel(text, options);
}

/** getByPlaceholder - matches an input by its `placeholder` attribute. */
export function byPlaceholder(scope: Scope, text: string | RegExp, options?: TextMatchOptions): Locator {
  return scope.getByPlaceholder(text, options);
}

/** getByAltText - matches an image (or other element with `alt`) by its alt text. */
export function byAltText(scope: Scope, text: string | RegExp, options?: TextMatchOptions): Locator {
  return scope.getByAltText(text, options);
}

/** getByTitle - matches an element by its `title` attribute. */
export function byTitle(scope: Scope, text: string | RegExp, options?: TextMatchOptions): Locator {
  return scope.getByTitle(text, options);
}

/** getByTestId - matches `data-testid` (or whatever `TEST_ID_ATTRIBUTE`/playwright.config.ts's testIdAttribute is set to). No exact/substring option - test ids are always matched exactly (or by RegExp). */
export function byTestId(scope: Scope, testId: string | RegExp): Locator {
  return scope.getByTestId(testId);
}
