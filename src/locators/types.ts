import type { FrameLocator, Locator, Page } from '@playwright/test';

/** Anything you can call getByRole()/getByText()/etc. on - a page, a frame, or another locator (for scoping a lookup inside a component's own root). */
export type Scope = Page | Locator | FrameLocator;

/** Every ARIA role Playwright's getByRole()/toHaveRole() recognize. */
export const ARIA_ROLES = [
  'alert',
  'alertdialog',
  'application',
  'article',
  'banner',
  'blockquote',
  'button',
  'caption',
  'cell',
  'checkbox',
  'code',
  'columnheader',
  'combobox',
  'complementary',
  'contentinfo',
  'definition',
  'deletion',
  'dialog',
  'directory',
  'document',
  'emphasis',
  'feed',
  'figure',
  'form',
  'generic',
  'grid',
  'gridcell',
  'group',
  'heading',
  'img',
  'insertion',
  'link',
  'list',
  'listbox',
  'listitem',
  'log',
  'main',
  'marquee',
  'math',
  'meter',
  'menu',
  'menubar',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'navigation',
  'none',
  'note',
  'option',
  'paragraph',
  'presentation',
  'progressbar',
  'radio',
  'radiogroup',
  'region',
  'row',
  'rowgroup',
  'rowheader',
  'scrollbar',
  'search',
  'searchbox',
  'separator',
  'slider',
  'spinbutton',
  'status',
  'strong',
  'subscript',
  'superscript',
  'switch',
  'tab',
  'table',
  'tablist',
  'tabpanel',
  'term',
  'textbox',
  'time',
  'timer',
  'toolbar',
  'tooltip',
  'tree',
  'treegrid',
  'treeitem',
] as const;

export type AriaRole = (typeof ARIA_ROLES)[number];

/** The full option set getByRole() supports - every one of these is a real ARIA attribute filter, not just a name match. */
export interface RoleLocatorOptions {
  /** Accessible name: a string matches case-insensitively as a substring, a RegExp matches its pattern exactly - use `exact: true` to force a full case-sensitive string match instead. */
  name?: string | RegExp;
  /** Forces `name`/`description` to match the full string, case-sensitively. Ignored when either is a RegExp. */
  exact?: boolean;
  /** `aria-checked` / native `<input type=checkbox>` state. */
  checked?: boolean;
  /** Accessible description - same substring/RegExp/exact matching rules as `name`. */
  description?: string | RegExp;
  /** `aria-disabled` / native `disabled`. */
  disabled?: boolean;
  /** `aria-expanded`. */
  expanded?: boolean;
  /** Match elements hidden from the accessibility tree too (excluded by default). */
  includeHidden?: boolean;
  /** `aria-level` - heading level, list nesting depth, etc. */
  level?: number;
  /** `aria-pressed`. */
  pressed?: boolean;
  /** `aria-selected`. */
  selected?: boolean;
}

export interface TextMatchOptions {
  /** Full case-sensitive match instead of the default case-insensitive substring match. Ignored when the text is a RegExp. */
  exact?: boolean;
}
