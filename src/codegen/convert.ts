import * as ts from 'typescript';
import * as path from 'node:path';

export interface ParamRule {
  /** Matches the locator's text (its role/name/label/selector) for a `fill()`. */
  pattern: RegExp;
  /** The environment variable the typed value is read from instead of being written into the test. */
  envVar: string;
}

export interface ConvertOptions {
  /** Shown in the header comment: the recording this came from. */
  source: string;
  /** Module `test` (and `expect`) come from. Default `@automation/referenced-automation-ui`; point it at your own base test to add fixtures. */
  testImport?: string;
  /** Module `actions`, `assertions`, `locators` ... come from. Default `@automation/referenced-automation-ui`. */
  uiImport?: string;
  /** Tag added to every test title. Default `@ui`. */
  tag?: string;
  /** Keep the scheme and host of every URL. By default only the path is kept and the host comes from BASE_URL. */
  keepHost?: boolean;
  /** Extra "this value must come from the environment" rules; passwords and tokens are always handled. */
  params?: ParamRule[];
  /** Put every locator in a page object (`pages/<Name>Page.ts`) instead of repeating it in the test. */
  pageObjects?: boolean;
  /**
   * By default the converted test starts with two objects: CONSTANTS (the URLs visited, every value typed, every expected
   * text / URL / count) and LOCATORS (every element, named once), and the steps only refer to them - so a changed input or
   * a changed page is one edit at the top. With `inline` the values and locators are written where they are used (handy for
   * a quick one-off conversion). Ignored with `pageObjects`, where the objects are at the top of the page object file.
   */
  inline?: boolean;
  /** Turn every typed literal into a column of a CSV file and run one test per row. */
  data?: boolean;
  /** Base name for the page object, data file and test title. Default: the source file name. */
  baseName?: string;
  /** Module path the spec imports the page object from. Default `./pages/<Name>Page`. */
  pageImport?: string;
}

export interface ConvertResult {
  spec: string;
  pageObject?: { fileName: string; code: string };
  data?: { fileName: string; csv: string; rows: Array<Record<string, string>> };
  warnings: string[];
  /** Environment variables the generated test reads. */
  envVars: string[];
  /** Origins the recording navigated to (BASE_URL should be the first unless `keepHost`). */
  origins: string[];
  tests: number;
  /** Statements that have no framework wrapper and were kept as plain Playwright code, marked TODO. */
  todos: number;
}

// ---------------------------------------------------------------------------------------------------------------------

const ARIA_ROLES = new Set(
  'alert alertdialog application article banner blockquote button caption cell checkbox code columnheader combobox complementary contentinfo definition deletion dialog directory document emphasis feed figure form generic grid gridcell group heading img insertion link list listbox listitem log main marquee math meter menu menubar menuitem menuitemcheckbox menuitemradio navigation none note option paragraph presentation progressbar radio radiogroup region row rowgroup rowheader scrollbar search searchbox separator slider spinbutton status strong subscript superscript switch tab table tablist tabpanel term textbox time timer toolbar tooltip tree treegrid treeitem'.split(' '),
);

const TEXT_LOCATORS: Record<string, string> = {
  getByText: 'byText',
  getByLabel: 'byLabel',
  getByPlaceholder: 'byPlaceholder',
  getByAltText: 'byAltText',
  getByTitle: 'byTitle',
  getByTestId: 'byTestId',
};

/** Methods that build or narrow a locator. */
const LOCATOR_METHODS = new Set([
  'getByRole', 'getByText', 'getByLabel', 'getByPlaceholder', 'getByAltText', 'getByTitle', 'getByTestId',
  'locator', 'frameLocator', 'contentFrame', 'first', 'last', 'nth', 'filter', 'and', 'or', 'describe', 'owner', 'within',
]);

/** Locator method name -> the `actions.*` function that does the same, logged. `args` are passed through after the locator. */
const ACTIONS: Record<string, string> = {
  click: 'click', dblclick: 'dblClick', fill: 'fill', pressSequentially: 'type', press: 'pressKey', check: 'check', uncheck: 'uncheck',
  setChecked: 'setChecked', selectOption: 'selectOption', hover: 'hover', clear: 'clear', focus: 'focus', blur: 'blur', tap: 'tap',
  selectText: 'selectText', scrollIntoViewIfNeeded: 'scrollIntoView', dispatchEvent: 'dispatchEvent',
};

/** Assertions the framework wraps (same name, target first). */
const ASSERTIONS = new Set([
  'toBeAttached', 'toBeVisible', 'toBeHidden', 'toBeEnabled', 'toBeDisabled', 'toBeChecked', 'toBeEditable', 'toBeEmpty', 'toBeFocused', 'toBeInViewport',
  'toContainText', 'toHaveText', 'toHaveValue', 'toHaveValues', 'toHaveAttribute', 'toHaveClass', 'toContainClass', 'toHaveCSS', 'toHaveId',
  'toHaveJSProperty', 'toHaveCount', 'toHaveRole', 'toHaveAccessibleName', 'toHaveAccessibleDescription', 'toHaveAccessibleErrorMessage',
  'toHaveTitle', 'toHaveURL', 'toHaveScreenshot', 'toMatchAriaSnapshot',
]);
const NEGATED_ASSERTIONS = new Set([
  'toBeVisible', 'toBeHidden', 'toBeEnabled', 'toBeDisabled', 'toBeChecked', 'toBeAttached', 'toContainText', 'toHaveText', 'toHaveValue',
  'toHaveAttribute', 'toHaveClass', 'toHaveCount', 'toHaveTitle', 'toHaveURL',
]);

/** Name endings for the CONSTANTS.expected entries of each assertion. */
const EXPECTED_SUFFIX: Record<string, string> = {
  toHaveText: 'Text', toContainText: 'ContainsText', toHaveValue: 'Value', toHaveValues: 'Values', toHaveAttribute: 'Attribute',
  toHaveClass: 'Class', toContainClass: 'ContainsClass', toHaveCount: 'Count', toHaveURL: 'Url', toHaveTitle: 'Title', toHaveId: 'Id',
  toHaveCSS: 'Css', toHaveRole: 'Role', toHaveAccessibleName: 'AccessibleName', toHaveAccessibleDescription: 'AccessibleDescription',
};

const SECRET_HINT = /pass(word|code|wd)?|secret|token|api[\s_-]?key|\bpin\b|\botp\b|credential|passphrase/i;

const quote = (value: string) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

const camel = (text: string) => {
  const parts = text.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  return parts.map((p, i) => (i === 0 ? p.charAt(0).toLowerCase() + p.slice(1) : p.charAt(0).toUpperCase() + p.slice(1))).join('');
};
const pascal = (text: string) => {
  const c = camel(text);
  return c.charAt(0).toUpperCase() + c.slice(1);
};
const snakeUpper = (text: string) => text.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();

// ---------------------------------------------------------------------------------------------------------------------

interface Link {
  name: string;
  args: ts.Expression[];
  call: boolean;
}

function strip(node: ts.Expression): ts.Expression {
  let current = node;
  while (ts.isParenthesizedExpression(current) || ts.isAwaitExpression(current) || ts.isNonNullExpression(current)) current = current.expression;
  return current;
}

/** `a.b(1).c.d(2)` -> root `a`, links [b(1), c, d(2)]. A root that is not a plain identifier (e.g. a call) is reported as undefined. */
function flatten(node: ts.Expression): { root?: ts.Identifier; links: Link[] } {
  let current = strip(node);
  const links: Link[] = [];
  for (;;) {
    if (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
      links.unshift({ name: current.expression.name.text, args: [...current.arguments], call: true });
      current = strip(current.expression.expression);
    } else if (ts.isPropertyAccessExpression(current)) {
      links.unshift({ name: current.name.text, args: [], call: false });
      current = strip(current.expression);
    } else break;
  }
  return { root: ts.isIdentifier(current) ? current : undefined, links };
}

const isString = (node: ts.Node | undefined): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral => !!node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node));

class Converter {
  readonly warnings: string[] = [];
  readonly envVars = new Set<string>();
  readonly origins = new Set<string>();
  readonly imports = new Set<string>();
  usesEnv = false;
  usesRoleShorthand = false;
  usesExpect = false;
  usesContextFixture = false;
  todos = 0;

  /** Variables known to be pages (the fixture, popups, tabs). */
  pageVars = new Set<string>(['page']);
  /** Variables that are a browser context. */
  contextVars = new Set<string>(['context']);

  // LOCATORS object (and the page object's members): chain code written against a `scope` parameter -> its name
  readonly members = new Map<string, { name: string; code: string }>();
  readonly memberNames = new Set<string>();
  // CONSTANTS object: section -> entries
  readonly constants = new Map<string, Array<{ name: string; code: string; secret?: string }>>();
  /** The root of the locator chain being rendered (`scope` inside LOCATORS) - so locators nested in arguments agree with it. */
  private currentRoot: string | undefined;
  usesConstants = false;
  usesLocatorsObject = false;
  // data mode
  readonly columns: Array<{ name: string; value: string }> = [];
  readonly columnNames = new Set<string>();

  constructor(
    readonly sf: ts.SourceFile,
    readonly options: ConvertOptions,
  ) {}

  /** Locators and values go into the CONSTANTS / LOCATORS objects (always in page-object mode; otherwise unless `inline`). */
  get objects(): boolean {
    return !this.options.inline || !!this.options.pageObjects;
  }

  text(node: ts.Node): string {
    return node.getText(this.sf);
  }

  line(node: ts.Node): number {
    return this.sf.getLineAndCharacterOfPosition(node.getStart(this.sf)).line + 1;
  }

  warn(node: ts.Node, message: string): void {
    this.warnings.push(`line ${this.line(node)}: ${message}`);
  }

  use(name: string): string {
    this.imports.add(name);
    return name;
  }

  // ---- arguments ----

  /** An argument as source: locator chains inside it (a filter's `has`) are converted, everything else is kept as written. */
  arg(node: ts.Expression): string {
    const locator = this.locator(node, { register: false });
    if (locator) return locator.code;
    if (ts.isObjectLiteralExpression(node)) {
      const props = node.properties.map((p) => {
        if (ts.isPropertyAssignment(p)) return `${this.text(p.name)}: ${this.arg(p.initializer)}`;
        return this.text(p);
      });
      return props.length === 0 ? '{}' : `{ ${props.join(', ')} }`;
    }
    if (ts.isArrayLiteralExpression(node)) return `[${node.elements.map((e) => this.arg(e)).join(', ')}]`;
    return this.text(node);
  }

  args(nodes: readonly ts.Expression[]): string {
    return nodes.map((n) => this.arg(n)).join(', ');
  }

  // ---- locators ----

  /**
   * A locator chain rooted at a page variable, as framework code. Returns the code (a reference into the page object in
   * page-object mode), what is left of the chain after the locator part (the action), and a hint for naming.
   */
  locator(node: ts.Expression, opts: { register: boolean }): { code: string; rest: Link[]; scope: string; hint: string; description: string; chain: string } | undefined {
    const { root, links } = flatten(node);
    if (!root || !this.pageVars.has(root.text)) return undefined;
    let i = 0;
    while (i < links.length && LOCATOR_METHODS.has((links[i] as Link).name) && (links[i] as Link).call) i++;
    if (i === 0) return undefined;
    const used = links.slice(0, i);
    const first = used[0] as Link;
    if (!/^(getBy|locator$|frameLocator$)/.test(first.name)) return undefined;

    const importsBefore = new Set(this.imports);
    const roleBefore = this.usesRoleShorthand;
    const registering = opts.register && this.objects;
    // Inside LOCATORS (and inside anything nested in the chain) the page is the `scope` parameter.
    const rootName = registering ? 'scope' : (this.currentRoot ?? root.text);
    const outerRoot = this.currentRoot;
    this.currentRoot = rootName;
    let code: string = rootName;
    let description = '';
    for (const link of used) {
      const rendered = this.renderLink(code, link);
      code = rendered.code;
      if (rendered.description && !description) description = rendered.description;
    }
    this.currentRoot = outerRoot;
    const hint = this.nameHint(used);
    const scope = root.text;
    const chain = code;
    if (registering) {
      const name = this.member(chain, hint);
      if (this.options.pageObjects) {
        // the locator code lives in the page object file, so the spec does not need what built it
        this.imports.clear();
        importsBefore.forEach((n) => this.imports.add(n));
        this.usesRoleShorthand = roleBefore;
      }
      if (this.options.pageObjects && scope === 'page') code = `ui.${name}`;
      else {
        this.usesLocatorsObject = true;
        code = `LOCATORS.${name}(${scope})`;
      }
    }
    return { code, rest: links.slice(i), scope, hint, description: description || hint, chain };
  }

  private renderLink(scopeCode: string, link: Link): { code: string; description?: string } {
    const [a0, a1] = link.args;
    switch (link.name) {
      case 'getByRole': {
        const role = isString(a0) ? a0.text : undefined;
        if (role && ARIA_ROLES.has(role)) {
          const options = a1 && ts.isObjectLiteralExpression(a1) ? a1 : undefined;
          if (!a1) return { code: `${this.useRole()}.${role}(${scopeCode})`, description: role };
          if (options) {
            let name: string | undefined;
            const rest: string[] = [];
            for (const p of options.properties) {
              if (ts.isPropertyAssignment(p) && this.text(p.name) === 'name') name = this.arg(p.initializer);
              else rest.push(ts.isPropertyAssignment(p) ? `${this.text(p.name)}: ${this.arg(p.initializer)}` : this.text(p));
            }
            const description = options && name ? name.replace(/^['"`/]|['"`/gi]*$/g, '') : role;
            const parts = [scopeCode, ...(name !== undefined ? [name] : rest.length > 0 ? ['undefined'] : [])];
            if (rest.length > 0) parts.push(`{ ${rest.join(', ')} }`);
            return { code: `${this.useRole()}.${role}(${parts.join(', ')})`, description };
          }
        }
        return { code: `${this.useLocators()}.byRole(${scopeCode}, ${this.args(link.args)})`, description: role };
      }
      case 'getByText':
      case 'getByLabel':
      case 'getByPlaceholder':
      case 'getByAltText':
      case 'getByTitle':
      case 'getByTestId':
        return { code: `${this.useLocators()}.${TEXT_LOCATORS[link.name]}(${scopeCode}, ${this.args(link.args)})`, description: isString(a0) ? a0.text : a0 ? this.text(a0) : undefined };
      case 'locator': {
        if (isString(a0) && !a1) {
          const selector = a0.text;
          const isXpath = /^(xpath=|\/\/|\(\/\/)/.test(selector);
          const fn = isXpath ? 'byXpath' : 'byCss';
          return { code: `${this.useLocators()}.${fn}(${scopeCode}, ${quote(selector.replace(/^(xpath|css)=/, ''))})`, description: selector };
        }
        return { code: `${scopeCode}.locator(${this.args(link.args)})`, description: a0 ? this.text(a0) : undefined };
      }
      default:
        return { code: `${scopeCode}.${link.name}(${this.args(link.args)})` };
    }
  }

  useRole(): string {
    this.usesRoleShorthand = true;
    this.use('locators');
    return 'role';
  }

  useLocators(): string {
    this.use('locators');
    return 'locators';
  }

  /** A short readable name for a locator: role + accessible name, label, text ... */
  nameHint(links: Link[]): string {
    // After a frame switch, name the thing inside the frame, not the frame.
    let from = 0;
    links.forEach((l, index) => {
      if (l.name === 'contentFrame' || l.name === 'frameLocator') from = index + 1;
    });
    const base = links.slice(from).find((l) => /^(getBy|locator$)/.test(l.name)) ?? links.find((l) => /^(getBy|locator$)/.test(l.name));
    let hint = '';
    if (base) {
      const [a0, a1] = base.args;
      const literal = (n: ts.Expression | undefined) => (isString(n) ? n.text : n && ts.isRegularExpressionLiteral(n) ? n.text.replace(/^\/|\/[a-z]*$/g, '') : undefined);
      if (base.name === 'getByRole') {
        const role = literal(a0) ?? 'element';
        let name: string | undefined;
        if (a1 && ts.isObjectLiteralExpression(a1)) {
          for (const p of a1.properties) if (ts.isPropertyAssignment(p) && this.text(p.name) === 'name') name = literal(p.initializer);
        }
        const roleWord = role === 'textbox' ? 'Textbox' : pascal(role);
        hint = `${camel(name ?? '')}${name ? roleWord : camel(role)}`;
      } else if (base.name === 'getByLabel') hint = `${camel(literal(a0) ?? 'field')}Field`;
      else if (base.name === 'getByPlaceholder') hint = `${camel(literal(a0) ?? 'field')}Field`;
      else if (base.name === 'getByText') hint = `${camel((literal(a0) ?? 'text').split(/\s+/).slice(0, 4).join(' '))}Text`;
      else if (base.name === 'getByAltText') hint = `${camel(literal(a0) ?? 'image')}Image`;
      else if (base.name === 'getByTitle') hint = `${camel(literal(a0) ?? 'element')}Element`;
      else if (base.name === 'getByTestId') hint = `${camel(literal(a0) ?? 'element')}`;
      else hint = `${this.selectorHint(literal(a0) ?? 'element')}Element`;
    }
    for (const link of links) {
      if (link.name === 'first') hint += 'First';
      else if (link.name === 'last') hint += 'Last';
      else if (link.name === 'nth' && link.args[0]) hint += `Nth${Number(this.text(link.args[0])) + 1 || ''}`;
    }
    hint = hint.replace(/^[^A-Za-z_$]+/, '');
    return hint || 'element';
  }

  /** A readable word or two for a CSS/XPath selector: its id, else its class, else its tag and quoted value. */
  private selectorHint(selector: string): string {
    const id = /#([\w-]+)/.exec(selector)?.[1];
    if (id) return camel(id);
    const cls = /\.([\w-]+)/.exec(selector)?.[1];
    if (cls) return camel(cls);
    const tag = /^([a-z][\w-]*)/i.exec(selector)?.[1] ?? 'element';
    const quoted = /["']([^"']+)["']/.exec(selector)?.[1];
    return camel(`${tag} ${(quoted ?? '').split(/\s+/).slice(0, 2).join(' ')}`);
  }

  /** The LOCATORS entry for `chain` (reused when the same locator comes up again): its name. */
  private member(chain: string, hint: string): string {
    const existing = this.members.get(chain);
    if (existing) return existing.name;
    let name = IDENTIFIER.test(hint) ? hint : 'element';
    for (let n = 2; this.memberNames.has(name); n++) name = `${hint}${n}`;
    this.memberNames.add(name);
    this.members.set(chain, { name, code: chain });
    return name;
  }

  /** A CONSTANTS entry: returns the reference (`CONSTANTS.inputs.username`) - or, with `inline`, the code itself. */
  constant(section: 'urls' | 'inputs' | 'expected', hint: string, code: string, secret?: string): string {
    if (!this.objects) return code;
    const entries = this.constants.get(section) ?? [];
    this.constants.set(section, entries);
    this.usesConstants = true;
    const existing = entries.find((e) => e.code === code && e.secret === secret && (e.name === hint || e.name.startsWith(hint)));
    if (existing) return `CONSTANTS.${section}.${existing.name}`;
    const base = IDENTIFIER.test(hint) ? hint : `${section.slice(0, -1)}Value`;
    let name = base;
    for (let n = 2; entries.some((e) => e.name === name); n++) name = `${base}${n}`;
    entries.push({ name, code, secret });
    return `CONSTANTS.${section}.${name}`;
  }

  // ---- values: secrets and data columns ----

  /** The expression for a typed value: the environment for secrets, a CSV column in data mode, else the literal. */
  value(node: ts.Expression, locatorInfo: { hint: string; description: string }): string {
    if (!isString(node)) return this.arg(node);
    const literal = node.text;
    const hintText = `${locatorInfo.description} ${locatorInfo.hint}`;
    const rule = (this.options.params ?? []).find((r) => r.pattern.test(hintText));
    if (rule) return this.secret(locatorInfo.hint, rule.envVar);
    if (SECRET_HINT.test(hintText)) return this.secret(locatorInfo.hint, `UI_${snakeUpper(locatorInfo.description && /[A-Za-z]/.test(locatorInfo.description) ? locatorInfo.description : locatorInfo.hint) || 'SECRET'}`);
    if (this.options.data && literal !== '') {
      let name = camel(locatorInfo.hint) || 'value';
      for (let n = 2; this.columnNames.has(name); n++) name = `${camel(locatorInfo.hint) || 'value'}${n}`;
      this.columnNames.add(name);
      this.columns.push({ name, value: literal });
      return `cell(row, ${quote(name)})`;
    }
    return literal === '' ? quote(literal) : this.constant('inputs', locatorInfo.hint, quote(literal));
  }

  /** A value that comes from the environment: in CONSTANTS as a getter (read when used, so a missing variable names itself), or inline. */
  secret(hint: string, envVar: string): string {
    this.usesEnv = true;
    this.envVars.add(envVar);
    return this.objects ? this.constant('inputs', hint, `env.get(${quote(envVar)})`, envVar) : this.env(envVar);
  }

  env(name: string): string {
    this.usesEnv = true;
    this.envVars.add(name);
    return `env.get(${quote(name)})`;
  }

  url(node: ts.Expression): string {
    if (!isString(node)) return this.arg(node);
    const raw = node.text;
    const origin = /^(https?:\/\/[^/?#]+)(.*)$/i.exec(raw);
    let target = raw;
    if (origin) {
      this.origins.add((origin[1] as string).toLowerCase());
      target = this.options.keepHost ? raw : ((origin[2] as string) || '/').replace(/^(?=[^/])/, '/');
    }
    const pathPart = (origin && this.options.keepHost ? (origin[2] as string) : target).split(/[?#]/)[0] ?? '';
    const hint = camel(pathPart.replace(/\.[a-z0-9]+$/i, (m) => ` ${m.slice(1)}`)) || 'home';
    return this.constant('urls', hint.replace(/^[^A-Za-z_$]+/, '') || 'home', quote(target));
  }

  /** An expected value of an assertion (text, URL, count, pattern) as a CONSTANTS entry, or as written when inline. */
  expected(node: ts.Expression, hint: string): string {
    const plain = isString(node) ? node.text !== '' : ts.isRegularExpressionLiteral(node) || ts.isNumericLiteral(node);
    if (!plain) return this.arg(node);
    return this.constant('expected', hint, isString(node) ? quote(node.text) : this.text(node));
  }
}

// ---------------------------------------------------------------------------------------------------------------------

type Lines = string[];

class StatementConverter {
  constructor(private readonly c: Converter) {}

  /** A block's statements, with the popup / download / dialog / response patterns folded into the framework's wrappers. */
  block(statements: readonly ts.Statement[]): Lines {
    const out: Lines = [];
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] as ts.Statement;

      // const popupPromise = page.waitForEvent('popup'); <trigger...>; const popup = await popupPromise;
      const pending = this.pendingPromise(statement);
      if (pending) {
        const end = statements.findIndex((s, j) => j > i && this.awaitsPromise(s, pending.name));
        if (end !== -1) {
          out.push(...this.wrapped(pending, statements.slice(i + 1, end), statements[end] as ts.VariableStatement, statements[end + 1], statements.slice(end + 1)));
          // a file chooser's setFiles line right after is folded into the wrapper
          i = end + (pending.event === 'filechooser' && this.followsWithSetFiles(statements[end + 1], statements[end] as ts.VariableStatement) ? 1 : 0);
          continue;
        }
        this.c.warn(statement, `"${this.c.text(statement)}" is never awaited in the recording; kept as written`);
      }

      // page.once('dialog', dialog => { ...accept/dismiss... }); <the click that raises it>
      const dialog = this.dialogListener(statement);
      if (dialog && statements[i + 1]) {
        const trigger = this.statement(statements[i + 1] as ts.Statement);
        this.c.use('dialogs');
        const answer = dialog.accept ? (dialog.text !== undefined ? `{ accept: ${dialog.text} }` : "'accept'") : "'dismiss'";
        out.push(`await dialogs.handleDialogDuring(${dialog.page}, async () => {`, ...trigger.map((l) => `  ${l}`), `}, ${answer});`);
        i += 1;
        continue;
      }

      out.push(...this.statement(statement));
    }
    return out;
  }

  // ---- promise patterns ----

  private pendingPromise(statement: ts.Statement): { name: string; event: string; scopeVar: string; args: readonly ts.Expression[]; call: string } | undefined {
    if (!ts.isVariableStatement(statement)) return undefined;
    const declaration = statement.declarationList.declarations[0];
    if (!declaration || !ts.isIdentifier(declaration.name) || !declaration.initializer) return undefined;
    const init = declaration.initializer;
    if (ts.isAwaitExpression(init)) return undefined;
    const { root, links } = flatten(init);
    const last = links[links.length - 1];
    if (!root || links.length !== 1 || !last?.call) return undefined;
    const known = this.c.pageVars.has(root.text) || this.c.contextVars.has(root.text);
    if (!known) return undefined;
    if (!['waitForEvent', 'waitForResponse', 'waitForRequest'].includes(last.name)) return undefined;
    const event = last.name === 'waitForEvent' && isString(last.args[0]) ? last.args[0].text : last.name === 'waitForResponse' ? 'response' : last.name === 'waitForRequest' ? 'request' : '';
    return { name: declaration.name.text, event, scopeVar: root.text, args: last.args, call: last.name };
  }

  private awaitsPromise(statement: ts.Statement, name: string): boolean {
    if (!ts.isVariableStatement(statement)) return false;
    const declaration = statement.declarationList.declarations[0];
    const init = declaration?.initializer;
    return !!init && ts.isAwaitExpression(init) && ts.isIdentifier(init.expression) && init.expression.text === name;
  }

  private followsWithSetFiles(next: ts.Statement | undefined, awaited: ts.VariableStatement): boolean {
    const variable = awaited.declarationList.declarations[0]?.name;
    if (!next || !ts.isExpressionStatement(next) || !variable || !ts.isIdentifier(variable)) return false;
    const { root, links } = flatten(next.expression);
    return root?.text === variable.text && links.length === 1 && links[0]?.name === 'setFiles';
  }

  private wrapped(
    pending: { name: string; event: string; scopeVar: string; args: readonly ts.Expression[]; call: string },
    trigger: readonly ts.Statement[],
    awaited: ts.VariableStatement,
    next: ts.Statement | undefined,
    after: readonly ts.Statement[],
  ): Lines {
    const variable = (awaited.declarationList.declarations[0] as ts.VariableDeclaration).name as ts.Identifier;
    const body = this.block(trigger);
    const action = ['async () => {', ...body.map((l) => `  ${l}`), '}'];
    const wrap = (head: string, tail: string): Lines => {
      const lines = [...action];
      lines[0] = `${head}${lines[0]}`;
      lines[lines.length - 1] = `${lines[lines.length - 1]}${tail}`;
      return lines;
    };
    const onContext = this.c.contextVars.has(pending.scopeVar);
    const target = pending.scopeVar;
    // Keep `const x = ` only when the rest of the recording uses x - no unused variables in the converted test.
    const referenced = after.some((s) => new RegExp(`\\b${variable.text}\\b`).test(this.c.text(s)));
    const bind = referenced ? `const ${variable.text} = ` : '';
    switch (pending.event) {
      case 'popup':
        this.c.pageVars.add(variable.text);
        this.c.use('actions');
        return wrap(`${bind}await actions.waitForNewTab(${target}, `, ');');
      case 'page':
        if (!onContext) break;
        this.c.pageVars.add(variable.text);
        this.c.use('tabs');
        this.c.usesContextFixture = true;
        return wrap(`${bind}await tabs.waitForNewPage(${target}, `, ');');
      case 'download':
        this.c.use('actions');
        return referenced
          ? wrap(`const ${variable.text} = (await actions.downloadAndRead(${target}, `, `, 'test-results/downloads')).download;`)
          : wrap(`await actions.downloadAndRead(${target}, `, `, 'test-results/downloads');`);
      case 'filechooser': {
        if (this.followsWithSetFiles(next, awaited)) {
          const files = flatten((next as ts.ExpressionStatement).expression).links[0]?.args[0];
          this.c.use('actions');
          return wrap(`await actions.chooseFiles(${target}, `, `, ${files ? this.c.arg(files) : "''"});`);
        }
        break;
      }
      case 'response': {
        const pattern = pending.args[0];
        if (pattern && (isString(pattern) || ts.isRegularExpressionLiteral(pattern))) {
          this.c.use('actions');
          return wrap(`${bind}await actions.waitForResponseMatching(${target}, ${this.c.text(pattern)}, `, ');');
        }
        break;
      }
      case 'request': {
        const pattern = pending.args[0];
        if (pattern && (isString(pattern) || ts.isRegularExpressionLiteral(pattern))) {
          this.c.use('network');
          return wrap(`${bind}await network.waitForRequestMatching(${target}, ${this.c.text(pattern)}, `, ');');
        }
        break;
      }
    }
    // No wrapper for this one: keep the recording's own shape.
    this.c.todos++;
    this.c.warn(awaited, `waitFor${pending.event ? `("${pending.event}")` : ''} has no framework wrapper; kept as Playwright code`);
    return [
      `// TODO(converter): no framework wrapper for this wait`,
      `const ${pending.name} = ${target}.${pending.call}(${this.c.args(pending.args)});`,
      ...body,
      `const ${variable.text} = await ${pending.name};`,
    ];
  }

  private dialogListener(statement: ts.Statement): { page: string; accept: boolean; text?: string } | undefined {
    if (!ts.isExpressionStatement(statement)) return undefined;
    const { root, links } = flatten(statement.expression);
    const last = links[links.length - 1];
    if (!root || !this.c.pageVars.has(root.text) || links.length !== 1 || !last?.call || !['once', 'on'].includes(last.name)) return undefined;
    if (!isString(last.args[0]) || last.args[0].text !== 'dialog') return undefined;
    const handler = last.args[1];
    const source = handler ? this.c.text(handler) : '';
    const accept = /\.accept\(/.test(source);
    const text = /\.accept\(\s*(['"`][^)]*)\)/.exec(source)?.[1];
    return { page: root.text, accept, text: text?.trim() };
  }

  // ---- one statement ----

  private statement(statement: ts.Statement): Lines {
    if (ts.isBlock(statement)) return this.block(statement.statements);
    if (ts.isVariableStatement(statement)) return this.variable(statement);
    if (ts.isExpressionStatement(statement)) return this.expression(statement, statement.expression);
    return this.raw(statement, 'a statement the converter does not model');
  }

  private variable(statement: ts.VariableStatement): Lines {
    const declaration = statement.declarationList.declarations[0];
    const init = declaration?.initializer;
    if (!declaration || !init) return this.raw(statement, 'a declaration without a value');
    const expr = strip(init);
    // const page1 = await context.newPage();  (library format) - becomes a known page
    const { root, links } = flatten(expr);
    if (root && this.c.contextVars.has(root.text) && links.length === 1 && links[0]?.name === 'newPage' && ts.isIdentifier(declaration.name)) {
      this.c.pageVars.add(declaration.name.text);
      this.c.use('tabs');
      this.c.usesContextFixture = true;
      return [`const ${declaration.name.text} = await tabs.openNewPage(${root.text});`];
    }
    return this.raw(statement, 'a declaration the converter does not model');
  }

  private expression(statement: ts.Statement, node: ts.Expression): Lines {
    const expr = strip(node);
    const expect = this.parseExpect(expr);
    if (expect) return this.assertion(statement, expect);

    const locator = this.c.locator(expr, { register: true });
    if (locator) return this.locatorAction(statement, locator);

    const { root, links } = flatten(expr);
    if (root && this.c.pageVars.has(root.text)) return this.pageCall(statement, root.text, links);
    if (root && this.c.contextVars.has(root.text)) return this.contextCall(statement, root.text, links);
    return this.raw(statement, 'a call the converter does not model');
  }

  // ---- locator actions ----

  private locatorAction(statement: ts.Statement, locator: { code: string; rest: Link[]; hint: string; description: string }): Lines {
    const [action, ...extra] = locator.rest;
    if (!action || extra.length > 0 || !action.call) return this.raw(statement, 'a locator chain with something after the action');
    const target = locator.code;
    const a = action.args;
    const wrapper = ACTIONS[action.name];
    this.c.use('actions');

    if (action.name === 'click' && a[0] && ts.isObjectLiteralExpression(a[0]) && a[0].properties.length === 1 && /button:\s*['"]right['"]/.test(this.c.text(a[0]))) {
      return [`await actions.rightClick(${target});`];
    }
    if (action.name === 'fill' && a[0]) return [`await actions.fill(${target}, ${this.c.value(a[0], locator)});`];
    if (action.name === 'selectOption' && a[0] && isString(a[0])) return [`await actions.selectOption(${target}, ${this.c.value(a[0], locator)});`];
    if (action.name === 'setInputFiles' && a[0]) {
      if (ts.isArrayLiteralExpression(a[0]) && a[0].elements.length === 0) return [`await actions.clearFiles(${target});`];
      if (isString(a[0])) return [`await actions.uploadFile(${target}, ${this.c.constant('inputs', locator.hint, quote(a[0].text))});`];
      if (ts.isArrayLiteralExpression(a[0])) return [`await actions.uploadFile(${target}, ${this.c.constant('inputs', locator.hint, this.c.arg(a[0]))});`];
      return this.raw(statement, 'setInputFiles from memory (use actions.uploadFromMemory)');
    }
    if (action.name === 'dragTo' && a[0]) {
      const dest = this.c.locator(a[0], { register: true });
      return [`await actions.dragAndDrop(${target}, ${dest ? dest.code : this.c.arg(a[0])});`];
    }
    if (wrapper) return [`await actions.${wrapper}(${[target, ...a.map((n) => this.c.arg(n))].join(', ')});`];
    return this.raw(statement, `locator.${action.name}() has no framework wrapper`);
  }

  // ---- page / context level ----

  private pageCall(statement: ts.Statement, page: string, links: Link[]): Lines {
    const first = links[0];
    const second = links[1];
    const a = first?.args ?? [];
    this.c.use('actions');
    if (!first) return this.raw(statement, 'a bare page reference');
    if (links.length === 1 && first.call) {
      switch (first.name) {
        case 'goto':
          if (a.length === 1 && a[0]) return [`await actions.goto(${page}, ${this.c.url(a[0])});`];
          return this.raw(statement, 'goto with options');
        case 'reload':
          return [`await actions.reload(${page});`];
        case 'goBack':
          return [`await actions.goBack(${page});`];
        case 'goForward':
          return [`await actions.goForward(${page});`];
        case 'waitForTimeout':
          this.c.warn(statement, `page.waitForTimeout(${a[0] ? this.c.text(a[0]) : ''}) was removed: a fixed wait is a guess - the actions and assertions after it already wait for what they need`);
          return [`// removed: page.waitForTimeout(${a[0] ? this.c.text(a[0]) : ''}) - actions and assertions wait for themselves`];
        case 'waitForLoadState':
          if (!a[0] || (isString(a[0]) && ['load', 'domcontentloaded'].includes(a[0].text))) return [`await actions.waitForLoadState(${page}${a[0] ? `, ${this.c.text(a[0])}` : ''});`];
          this.c.warn(statement, `page.waitForLoadState(${a[0] ? this.c.text(a[0]) : ''}) was removed: "networkidle" never settles on a page that polls - assert on what should be there instead`);
          return ['// removed: waitForLoadState(networkidle) - assert on the element or state you are waiting for'];
        case 'waitForURL':
          if (a.length === 1 && a[0]) {
            this.c.use('assertions');
            return [`await assertions.toHaveURL(${page}, ${this.c.expected(a[0], 'pageUrl')});`];
          }
          return this.raw(statement, 'waitForURL with options');
        case 'setViewportSize':
          if (a[0] && ts.isObjectLiteralExpression(a[0])) {
            const get = (key: string) => a[0] && ts.isObjectLiteralExpression(a[0]) ? a[0].properties.map((p) => (ts.isPropertyAssignment(p) && this.c.text(p.name) === key ? this.c.text(p.initializer) : undefined)).find(Boolean) : undefined;
            const [w, h] = [get('width'), get('height')];
            if (w && h) {
              this.c.use('emulation');
              return [`await emulation.setViewport(${page}, ${w}, ${h});`];
            }
          }
          return this.raw(statement, 'setViewportSize');
        case 'close':
          return [`// removed: ${page}.close() - the test fixture closes the page`];
        case 'pause':
          this.c.warn(statement, 'page.pause() was removed: it stops a run waiting for a person');
          return ['// removed: page.pause()'];
        case 'bringToFront':
          this.c.use('tabs');
          return [`await tabs.switchToTab(${page});`];
      }
    }
    if (links.length === 2 && first.name === 'keyboard' && !first.call && second?.call) {
      const b = second.args;
      if (second.name === 'press' && b[0]) return [`await actions.pressOnPage(${page}, ${this.c.arg(b[0])});`];
      if (second.name === 'type' && b[0]) return [`await actions.typeOnPage(${page}, ${isString(b[0]) ? this.c.constant('inputs', 'typedText', quote(b[0].text)) : this.c.arg(b[0])});`];
    }
    if (links.length === 2 && first.name === 'mouse' && !first.call && second?.call) {
      const b = second.args;
      if (second.name === 'wheel' && b.length === 2) return [`await actions.scrollWheel(${page}, ${this.c.args(b)});`];
      if (second.name === 'move' && b.length >= 2) return [`await actions.moveMouse(${page}, ${this.c.text(b[0] as ts.Expression)}, ${this.c.text(b[1] as ts.Expression)});`];
    }
    return this.raw(statement, `${page}.${links.map((l) => l.name).join('.')}() has no framework wrapper`);
  }

  private contextCall(statement: ts.Statement, context: string, links: Link[]): Lines {
    const first = links[0];
    if (first?.name === 'close') return [`// removed: ${context}.close() - the test fixture closes the context`];
    this.c.usesContextFixture = true;
    return this.raw(statement, `${context}.${links.map((l) => l.name).join('.')}() has no framework wrapper`);
  }

  // ---- assertions ----

  private parseExpect(expr: ts.Expression): { target: ts.Expression; matcher: string; args: ts.Expression[]; negated: boolean; message?: ts.Expression } | undefined {
    if (!ts.isCallExpression(expr) || !ts.isPropertyAccessExpression(expr.expression)) return undefined;
    const matcher = expr.expression.name.text;
    let inner = strip(expr.expression.expression);
    let negated = false;
    if (ts.isPropertyAccessExpression(inner) && inner.name.text === 'not') {
      negated = true;
      inner = strip(inner.expression);
    }
    if (!ts.isCallExpression(inner) || !ts.isIdentifier(inner.expression) || inner.expression.text !== 'expect' || !inner.arguments[0]) return undefined;
    return { target: inner.arguments[0], matcher, args: [...expr.arguments], negated, message: inner.arguments[1] };
  }

  private assertion(statement: ts.Statement, e: { target: ts.Expression; matcher: string; args: ts.Expression[]; negated: boolean; message?: ts.Expression }): Lines {
    const locator = this.c.locator(e.target, { register: true });
    const strippedTarget = strip(e.target);
    const isPage = ts.isIdentifier(strippedTarget) && this.c.pageVars.has(strippedTarget.text);
    const supported = e.negated ? NEGATED_ASSERTIONS.has(e.matcher) : ASSERTIONS.has(e.matcher);
    const target = locator && locator.rest.length === 0 ? locator.code : isPage ? strippedTarget.getText(this.c.sf) : undefined;
    if (!supported || !target || e.message) {
      return this.raw(statement, `${e.negated ? 'not.' : ''}${e.matcher} has no framework wrapper for this target`);
    }
    this.c.use('assertions');
    // The values being compared (not options, not the attribute name) are named constants.
    const valueIndex = ['toHaveAttribute', 'toHaveCSS', 'toHaveJSProperty'].includes(e.matcher) ? 1 : 0;
    const subject = locator ? locator.hint : 'page';
    const suffix = EXPECTED_SUFFIX[e.matcher] ?? pascal(e.matcher.replace(/^toHave|^to/, ''));
    const hint = camel(`${subject} ${e.negated ? 'not ' : ''}${suffix}`);
    const skip = e.matcher === 'toMatchAriaSnapshot' || e.matcher === 'toHaveScreenshot';
    const args = e.args.map((n, index) => (index === valueIndex && !skip ? this.c.expected(n, hint) : this.c.arg(n)));
    return [`await assertions.${e.negated ? 'not.' : ''}${e.matcher}(${[target, ...args].join(', ')});`];
  }

  // ---- fallback ----

  /** Keeps the recorded statement as Playwright code - its locators converted - marked so it is not forgotten. */
  private raw(statement: ts.Statement, why: string): Lines {
    this.c.todos++;
    this.c.warn(statement, `kept as Playwright code: ${why}`);
    this.c.usesExpect ||= /\bexpect\b/.test(this.c.text(statement));
    const source = this.c.text(statement);
    return [`// TODO(converter): ${why}`, ...source.split('\n')];
  }
}

// ---------------------------------------------------------------------------------------------------------------------

interface FoundTest {
  title: string;
  statements: readonly ts.Statement[];
  fixtures: string[];
  node: ts.Node;
}

function findTests(sf: ts.SourceFile): { tests: FoundTest[]; uses: ts.Statement[]; library: boolean } {
  const tests: FoundTest[] = [];
  const uses: ts.Statement[] = [];
  let library = false;

  const visit = (statement: ts.Statement) => {
    if (!ts.isExpressionStatement(statement)) return;
    const expr = statement.expression;
    if (ts.isCallExpression(expr)) {
      const callee = expr.expression;
      const calleeText = callee.getText(sf);
      if (calleeText === 'test.use') {
        uses.push(statement);
        return;
      }
      if (/^test(\.(only|skip|fixme|slow))?$/.test(calleeText)) {
        const fn = expr.arguments.find((a): a is ts.ArrowFunction | ts.FunctionExpression => ts.isArrowFunction(a) || ts.isFunctionExpression(a));
        const title = isString(expr.arguments[0]) ? expr.arguments[0].text : 'test';
        if (fn && ts.isBlock(fn.body)) {
          const fixtures: string[] = [];
          const first = fn.parameters[0]?.name;
          if (first && ts.isObjectBindingPattern(first)) for (const element of first.elements) fixtures.push(element.name.getText(sf));
          tests.push({ title, statements: fn.body.statements, fixtures, node: statement });
        }
        return;
      }
      if (calleeText === 'test.describe' || calleeText.startsWith('test.describe.')) {
        const fn = expr.arguments.find((a): a is ts.ArrowFunction | ts.FunctionExpression => ts.isArrowFunction(a) || ts.isFunctionExpression(a));
        if (fn && ts.isBlock(fn.body)) fn.body.statements.forEach(visit);
        return;
      }
      // (async () => { ... })();   the library format
      const inner = ts.isParenthesizedExpression(callee) ? callee.expression : undefined;
      if (inner && (ts.isArrowFunction(inner) || ts.isFunctionExpression(inner)) && ts.isBlock(inner.body)) {
        library = true;
        tests.push({ title: 'test', statements: inner.body.statements, fixtures: ['page'], node: statement });
      }
    }
  };
  sf.statements.forEach(visit);
  return { tests, uses, library };
}

/** In the library format the recording builds its own browser: drop that scaffolding. */
function dropLibraryScaffolding(statements: readonly ts.Statement[], c: Converter): ts.Statement[] {
  const kept: ts.Statement[] = [];
  for (const statement of statements) {
    const text = c.text(statement);
    if (ts.isVariableStatement(statement)) {
      const declaration = statement.declarationList.declarations[0];
      const init = declaration?.initializer ? strip(declaration.initializer) : undefined;
      const source = init ? c.text(init) : '';
      if (/\.launch\(/.test(source) || /\.newContext\(/.test(source) || /require\(['"]playwright/.test(source)) {
        if (/\.newContext\(/.test(source) && /\(\s*\{/.test(source)) c.warnings.push(`line ${c.line(statement)}: newContext(...) options were not carried over - set them with test.use({ ... }) or a device project`);
        if (declaration && ts.isIdentifier(declaration.name) && /\.newContext\(/.test(source)) c.contextVars.add(declaration.name.text);
        continue;
      }
      if (/\.newPage\(\)/.test(source) && declaration && ts.isIdentifier(declaration.name) && /^\s*(await\s+)?\w+\.newPage\(\)/.test(source) && declaration.name.text === 'page') {
        continue; // the fixture provides `page`
      }
    }
    if (/^await\s+(browser|context)\.close\(\)/.test(text)) continue;
    kept.push(statement);
  }
  return kept;
}

const SECTION_COMMENTS: Record<string, string> = {
  urls: 'pages the recording visited (relative to BASE_URL)',
  inputs: 'what the recording typed, selected or uploaded - secrets are read from the environment',
  expected: 'what the recording checked',
};

/** The CONSTANTS object: every URL, typed value and expected value, named once, to edit in one place. */
function constantsBlock(c: Converter, exported: boolean): string[] {
  if (c.constants.size === 0) return [];
  const lines = [
    '/** Everything the recording visited, typed and expected. Change a value here and every step that uses it follows. */',
    `${exported ? 'export ' : ''}const CONSTANTS = {`,
  ];
  for (const section of ['urls', 'inputs', 'expected']) {
    const entries = c.constants.get(section);
    if (!entries || entries.length === 0) continue;
    lines.push(`  // ${SECTION_COMMENTS[section]}`, `  ${section}: {`);
    for (const entry of entries) {
      if (entry.secret) lines.push(`    get ${entry.name}() {`, `      return ${entry.code};`, '    },');
      else lines.push(`    ${entry.name}: ${entry.code},`);
    }
    lines.push('  },');
  }
  lines.push('} as const;', '');
  return lines;
}

/** The LOCATORS object: every element the recording used, named once, as a function of the page it is looked up on. */
function locatorsBlock(c: Converter, exported: boolean): string[] {
  if (c.members.size === 0) return [];
  return [
    '/** Every element the recording used, named once. When the page changes, fix the locator here and every step follows. */',
    `${exported ? 'export ' : ''}const LOCATORS = {`,
    ...[...c.members.values()].map((m) => `  ${m.name}: (scope: Page) => ${m.code},`),
    '} as const;',
    '',
  ];
}

function csvEscape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Converts what `npx playwright codegen` records (the `playwright-test` TypeScript output, or the `library` JavaScript
 * output) into a test written the way this framework is meant to be used: `actions`, `locators`, `assertions`,
 * the popup / download / dialog / file-chooser helpers - with passwords and tokens read from the environment, fixed
 * waits removed, and anything that has no wrapper kept as marked, plain Playwright.
 */
export function convertCodegen(text: string, options: ConvertOptions): ConvertResult {
  const sf = ts.createSourceFile('recording.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const { tests, uses, library } = findTests(sf);
  if (tests.length === 0) {
    throw new Error(`No Playwright test found in ${options.source}. Expected what "npx playwright codegen" records: test('...', async ({ page }) => { ... }).`);
  }

  const baseName = options.baseName ?? path.basename(options.source).replace(/\.[^.]+$/, '').replace(/\.spec$/, '');
  const converter = new Converter(sf, options);
  const statements = new StatementConverter(converter);
  const tag = options.tag ?? '@ui';

  const bodies: string[] = [];
  const pageName = pascal(baseName) || 'Recorded';
  for (const found of tests) {
    converter.pageVars = new Set(['page']);
    converter.contextVars = new Set(['context']);
    const fixtureNames = new Set(found.fixtures);
    const list = library ? dropLibraryScaffolding(found.statements, converter) : [...found.statements];
    const lines = statements.block(list);
    const fixtures = new Set(['page']);
    if (converter.usesContextFixture || fixtureNames.has('context')) fixtures.add('context');
    for (const extra of fixtureNames) if (!['page', 'context'].includes(extra)) fixtures.add(extra);
    const title = found.title === 'test' ? baseName : found.title;
    const header = `${options.data ? 'for (const [index, row] of rows.entries()) {\n' : ''}`;
    void header;

    const inner: string[] = [];
    if (options.pageObjects) inner.push(`const ui = create${pageName}Page(page);`);
    inner.push(...lines);
    const titleCode = options.data ? `\`${title.replace(/[`\\$]/g, '\\$&')} #\${index + 1} ${tag}\`` : quote(`${title} ${tag}`.trim());
    const testLines = [
      `test(${titleCode}, async ({ ${[...fixtures].join(', ')} }) => {`,
      ...inner.map((l) => (l === '' ? '' : `  ${l}`)),
      '});',
    ];
    bodies.push(...(options.data ? ['for (const [index, row] of rows.entries()) {', ...testLines.map((l) => `  ${l}`), '}'] : testLines), '');
  }
  if (converter.origins.size > 1 && !options.keepHost) {
    converter.warnings.push(`The recording visited ${converter.origins.size} different origins (${[...converter.origins].join(', ')}); BASE_URL can only be one - use --keep-host to keep full URLs`);
  }

  // ---- imports ----
  const testImport = options.testImport ?? '@automation/referenced-automation-ui';
  const uiImport = options.uiImport ?? '@automation/referenced-automation-ui';
  const names = [...converter.imports].sort();
  const importLines: string[] = [];
  if (options.data) importLines.push("import * as path from 'node:path';");
  const specUsesEnv = converter.usesEnv && !options.pageObjects; // with a page object, CONSTANTS (and so `env`) live in its file
  const utilsNames = [...(specUsesEnv ? ['loadEnv'] : []), ...(options.data ? ['csvUtils'] : [])];
  if (utilsNames.length > 0) importLines.push(`import { ${utilsNames.join(', ')} } from '@automation/referenced-automation-utils';`);
  const testNames = ['test', ...(converter.usesExpect ? ['expect'] : [])];
  if (testImport === uiImport) importLines.push(`import { ${[...names, ...testNames].sort().join(', ')} } from ${quote(testImport)};`);
  else {
    if (names.length > 0) importLines.push(`import { ${names.join(', ')} } from ${quote(uiImport)};`);
    importLines.push(`import { ${testNames.sort().join(', ')} } from ${quote(testImport)};`);
  }
  if (options.pageObjects) {
    const fromPage = [...(converter.usesConstants ? ['CONSTANTS'] : []), ...(converter.usesLocatorsObject ? ['LOCATORS'] : []), `create${pageName}Page`];
    importLines.push(`import { ${fromPage.join(', ')} } from ${quote(options.pageImport ?? `./pages/${pageName}Page`)};`);
  } else if (converter.members.size > 0) {
    importLines.push("import type { Page } from '@playwright/test';");
  }

  const preamble: string[] = [];
  if (specUsesEnv) preamble.push('const env = loadEnv();');
  if (converter.usesRoleShorthand && !options.pageObjects) preamble.push('const { role } = locators;');
  if (options.data) {
    preamble.push(`const rows = csvUtils.parseCsvFile(path.join(__dirname, ${quote(`${baseName}.data.csv`)}));`);
    preamble.push(
      '',
      '/** One cell of a data row; a missing column fails with its name instead of typing "undefined". */',
      'function cell(row: Record<string, string>, column: string): string {',
      '  const value = row[column];',
      "  if (value === undefined) throw new Error(`The data file has no column \"${column}\"`);",
      '  return value;',
      '}',
    );
  }

  const origins = [...converter.origins].sort();
  const header = [
    `// Generated by ui-codegen-to-playwright from ${options.source}.`,
    '// Edit freely - or keep the recording as the source of truth and convert it again to a new file.',
    ...(converter.envVars.size > 0 ? [`// Typed secrets are never written into the test; set: ${[...converter.envVars].sort().join(', ')}`] : []),
    ...(origins.length > 0 && !options.keepHost ? [`// Paths are relative to BASE_URL - set it to ${origins[0]} to open what was recorded.`] : []),
  ];
  const specCode = [
    ...header,
    ...importLines,
    '',
    ...(preamble.length > 0 ? [...preamble, ''] : []),
    ...(options.pageObjects ? [] : [...constantsBlock(converter, false), ...locatorsBlock(converter, false)]),
    ...(uses.length > 0 ? [...uses.map((u) => converter.text(u)), ''] : []),
    ...bodies,
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+$/, '\n');

  const result: ConvertResult = {
    spec: specCode,
    warnings: converter.warnings,
    envVars: [...converter.envVars].sort(),
    origins,
    tests: tests.length,
    todos: converter.todos,
  };

  if (options.pageObjects) {
    const usesRole = [...converter.members.values()].some((m) => m.code.includes('role.'));
    const members = [...converter.members.values()];
    const lines = [
      `// Generated by ui-codegen-to-playwright from ${options.source}.`,
      '// CONSTANTS and LOCATORS first: change a value or fix a locator once, here. Then the page object built from them - rename members, group them into components, add methods.',
      ...(converter.usesEnv ? ["import { loadEnv } from '@automation/referenced-automation-utils';"] : []),
      "import type { Locator, Page } from '@playwright/test';",
      `import { locators } from ${quote(uiImport.startsWith('.') ? path.posix.join('..', uiImport) : uiImport)};`,
      '',
      ...(converter.usesEnv ? ['const env = loadEnv();'] : []),
      ...(usesRole ? ['const { role } = locators;'] : []),
      ...(converter.usesEnv || usesRole ? [''] : []),
      ...constantsBlock(converter, true),
      ...locatorsBlock(converter, true),
      `export interface ${pageName}Page {`,
      ...members.map((m) => `  readonly ${m.name}: Locator;`),
      '}',
      '',
      `export function create${pageName}Page(page: Page): ${pageName}Page {`,
      '  return {',
      ...members.map((m) => `    ${m.name}: LOCATORS.${m.name}(page),`),
      '  };',
      '}',
      '',
    ];
    result.pageObject = { fileName: `${pageName}Page.ts`, code: lines.join('\n') };
  }

  if (options.data) {
    const row: Record<string, string> = Object.fromEntries(converter.columns.map((c) => [c.name, c.value]));
    const names2 = converter.columns.map((c) => c.name);
    result.data = {
      fileName: `${baseName}.data.csv`,
      rows: [row],
      csv: `${names2.map(csvEscape).join(',')}\n${names2.map((n) => csvEscape(row[n] as string)).join(',')}\n`,
    };
  }
  return result;
}
