import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import type { AxeResults, Result } from 'axe-core';
import { logger } from '@automation/referenced-automation-utils';

/** Defaults to the two rule sets most orgs are actually required to meet. */
const DEFAULT_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa'];

export interface AccessibilityCheckOptions {
  /** WCAG/best-practice tags to scan for. Defaults to wcag2a/wcag2aa/wcag21aa. */
  tags?: string[];
  /** Extra axe rule IDs to run in addition to `tags` (e.g. 'color-contrast'). */
  rules?: string[];
  /** Axe rule IDs to turn off - use sparingly, and note *why* at the call site. */
  disableRules?: string[];
  /** CSS selector(s) to scan only within (e.g. a modal), instead of the whole page. */
  include?: string | string[];
  /** CSS selector(s) to exclude from the scan (e.g. a known third-party widget). */
  exclude?: string | string[];
}

function buildAxeBuilder(page: Page, options: AccessibilityCheckOptions = {}): AxeBuilder {
  const builder = new AxeBuilder({ page }).withTags(options.tags ?? DEFAULT_TAGS);
  if (options.rules) builder.withRules(options.rules);
  if (options.disableRules) builder.disableRules(options.disableRules);
  if (options.include) builder.include(options.include);
  if (options.exclude) builder.exclude(options.exclude);
  return builder;
}

/** Runs an axe-core scan and returns the full results (violations, passes, incomplete, inapplicable). */
export async function checkAccessibility(
  page: Page,
  options?: AccessibilityCheckOptions,
): Promise<AxeResults> {
  const results = await buildAxeBuilder(page, options).analyze();
  logger.info(
    `Accessibility scan: ${results.violations.length} violation(s), ${results.passes.length} passed rule(s)`,
  );
  return results;
}

/**
 * Runs an axe-core scan and throws a readable, per-violation error if any
 * are found - drop straight into a test as the assertion:
 *   await expectNoAccessibilityViolations(page);
 */
export async function expectNoAccessibilityViolations(
  page: Page,
  options?: AccessibilityCheckOptions,
): Promise<void> {
  const results = await checkAccessibility(page, options);
  if (results.violations.length > 0) {
    throw new Error(formatViolations(results.violations));
  }
}

export function formatViolations(violations: Result[]): string {
  const lines = violations.map((violation) => {
    const targets = violation.nodes.map((node) => node.target.join(' ')).join(', ');
    return `[${violation.impact ?? 'unknown'}] ${violation.id}: ${violation.help}\n    targets: ${targets}\n    ${violation.helpUrl}`;
  });
  return `${violations.length} accessibility violation(s) found:\n${lines.join('\n')}`;
}
