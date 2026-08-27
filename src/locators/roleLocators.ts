import type { Locator } from '@playwright/test';
import { ARIA_ROLES, type AriaRole, type RoleLocatorOptions, type Scope } from './types';

/** getByRole with the full option set - name (string or RegExp), exact, checked, disabled, expanded, includeHidden, level, pressed, selected, description. */
export function byRole(scope: Scope, role: AriaRole, options: RoleLocatorOptions = {}): Locator {
  return scope.getByRole(role, options);
}

type RoleShorthand = (scope: Scope, name?: string | RegExp, options?: Omit<RoleLocatorOptions, 'name'>) => Locator;

/**
 * One shorthand function per ARIA role, generated from the same list
 * getByRole() itself accepts - `role.button(page, 'Submit')` instead of
 * `page.getByRole('button', { name: 'Submit' })`. `name` takes a plain
 * string (case-insensitive substring match) or a RegExp (pattern match);
 * every other getByRole() option (`exact`, `checked`, `disabled`,
 * `expanded`, `includeHidden`, `level`, `pressed`, `selected`, `description`)
 * is available as the third argument.
 *
 * ```ts
 * role.button(page, 'Submit')
 * role.button(page, 'Submit', { exact: true })
 * role.button(page, /submit/i)
 * role.checkbox(page, 'Accept terms', { checked: true })
 * role.heading(page, 'Welcome', { level: 1 })
 * role.tab(page, 'Settings', { selected: true })
 * role.option(page, 'United Kingdom', { exact: true })
 * ```
 *
 * Scoped the same way any Playwright locator is - pass a `Locator` (e.g. a
 * component's own root) instead of `page` to search only within it:
 * `role.button(root, 'Remove')`.
 */
export const role: Record<AriaRole, RoleShorthand> = Object.fromEntries(
  ARIA_ROLES.map((r) => [
    r,
    ((scope, name, options) => byRole(scope, r, { ...options, name })) satisfies RoleShorthand,
  ]),
) as Record<AriaRole, RoleShorthand>;
