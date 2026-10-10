import { test, expect } from '../src/fixtures/uiFixtures';
import * as locators from '../src/locators';
import * as assertions from '../src/assertions';
import { servePage } from './support/servePage';

const { role } = locators;

const PAGE = `
<ul id="products">
  <li class="p" data-sku="a"><h3>Product 1</h3><button>Add to cart</button></li>
  <li class="p" data-sku="b"><h3>Product 2</h3><button>Add to cart</button><span class="badge">Out of stock</span></li>
  <li class="p hidden-item" style="display:none"><h3>Product 3</h3></li>
</ul>
<button title="Subscribe">Subscribe now</button>
<button>Other</button>
<div id="cookie">Cookies?</div>
<table id="orders">
  <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
  <tbody>
    <tr><td>Ada</td><td>ada@example.com</td><td>Admin</td></tr>
    <tr><td>Grace</td><td>grace@example.com</td><td>User</td></tr>
  </tbody>
</table>
<iframe id="outer" srcdoc="<iframe id='inner' srcdoc='<button>Deep</button>'></iframe><p>outer text</p>" name="outerFrame"></iframe>
`;

test.describe('advanced locators', () => {
  test.beforeEach(async ({ page }) => servePage(page, PAGE));

  test('byCss and byXpath', async ({ page }) => {
    await assertions.toHaveCount(locators.byCss(page, '#products > li'), 3);
    await assertions.toHaveCount(locators.byXpath(page, '//ul[@id="products"]/li'), 3);
    await assertions.toHaveText(locators.byCss(page, '[data-sku=b] h3'), 'Product 2');
  });

  test('filterBy: hasText, hasNotText, has, hasNot, visible', async ({ page }) => {
    const items = role.listitem(page);
    await assertions.toHaveCount(locators.filterBy(items, { hasText: 'Product 2' }), 1);
    await assertions.toHaveCount(locators.filterBy(items, { hasNotText: 'Out of stock' }), 1); // hidden item is not in the accessibility tree
    await assertions.toHaveCount(locators.filterBy(items, { has: role.heading(page, 'Product 1') }), 1);
    await assertions.toHaveCount(locators.filterBy(items, { hasNot: locators.byCss(page, '.badge') }), 1);
    await assertions.toHaveCount(locators.filterBy(locators.byCss(page, 'li.p'), { visible: true }), 2);
    await assertions.toHaveCount(locators.filterBy(locators.byCss(page, 'li.p'), { visible: false }), 1);
  });

  test('either / both / within / nth / all', async ({ page }) => {
    // either: whichever exists
    const banner = locators.either(locators.byCss(page, '#cookie'), locators.byCss(page, '#login'));
    await assertions.toBeVisible(banner);
    // both: has role button AND the title
    await assertions.toHaveText(locators.both(role.button(page), locators.byTitle(page, 'Subscribe')), 'Subscribe now');
    // within: the button of every product, not the first button on the page
    const addButtons = locators.within(role.button(page, 'Add to cart'), role.listitem(page));
    await assertions.toHaveCount(addButtons, 2);
    await assertions.toHaveText(locators.nth(role.listitem(page), 1).locator('h3'), 'Product 2');
    const all = await locators.all(role.listitem(page));
    expect(all).toHaveLength(2);
  });

  test('frameChain reaches an iframe inside an iframe; frameBy finds a Frame object and names the frames when it cannot', async ({ page }) => {
    const deep = locators.frameChain(page, ['#outer', '#inner']);
    await assertions.toBeVisible(role.button(deep, 'Deep'));
    expect(() => locators.frameChain(page, [])).toThrow(/at least one selector/);
    const frame = locators.frameBy(page, 'outerFrame');
    expect(frame.name()).toBe('outerFrame');
    expect(() => locators.frameBy(page, 'nope')).toThrow(/No frame matches "nope"/);
  });

  test('tables: rowWithText, cellInRow, readTable', async ({ page }) => {
    const table = role.table(page);
    const row = locators.rowWithText(table, 'Grace');
    const email = await locators.cellInRow(table, row, 'email');
    await assertions.toHaveText(email, 'grace@example.com');
    await assertions.toHaveText(await locators.cellInRow(table, row, /^ro/i), 'User');
    await expect(locators.cellInRow(table, row, 'Salary')).rejects.toThrow(/No column "Salary" in the table. Columns: Name, Email, Role/);
    expect(await locators.readTable(table)).toEqual([
      { Name: 'Ada', Email: 'ada@example.com', Role: 'Admin' },
      { Name: 'Grace', Email: 'grace@example.com', Role: 'User' },
    ]);
  });
});
