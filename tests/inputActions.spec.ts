import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test, expect } from '../src/fixtures/uiFixtures';
import * as actions from '../src/actions';
import * as assertions from '../src/assertions';
import * as locators from '../src/locators';
import { servePage } from './support/servePage';

const { role } = locators;

const PAGE = `
<label>First name <input id="first" value="Ada Lovelace"></label>
<label>Country <select id="country"><option value="uk">United Kingdom</option><option value="us">United States</option></select></label>
<label>Interests <select id="interests" multiple><option>Maths</option><option>Poetry</option><option>Engines</option></select></label>
<label>Subscribe <input type="checkbox" id="sub"></label>
<label>Plan <input type="radio" name="plan" id="pro"></label>
<label>Notes <textarea id="notes"></textarea></label>
<input id="file" type="file" multiple>
<button id="chooser" onclick="const i=document.createElement('input');i.type='file';i.onchange=()=>{document.getElementById('chosen').textContent=[...i.files].map(f=>f.name).join(',')};i.click()">Choose</button>
<span id="chosen"></span>
<button id="b" onclick="document.getElementById('log').textContent += ' click:'+[event.ctrlKey?'ctrl':'',event.shiftKey?'shift':''].join('')+':'+Math.round(event.offsetX)+','+Math.round(event.offsetY)">Press</button>
<div id="box" style="width:200px;height:100px;background:#ccc" onclick="document.getElementById('log').textContent += ' box:'+event.offsetX+','+event.offsetY"></div>
<button id="covered" onclick="document.getElementById('log').textContent+=' covered'">Covered</button>
<div id="overlay" style="position:fixed;top:0;left:0;width:100%;height:100%;display:none;background:rgba(0,0,0,.1)"></div>
<input id="blurry" onblur="document.getElementById('log').textContent+=' blurred'">
<div id="ev" onfoo="1"></div>
<div id="slider" style="position:relative;width:200px;height:20px;background:#eee"><div id="thumb" style="position:absolute;left:0;top:0;width:20px;height:20px;background:#333"></div></div>
<div id="tall" style="height:3000px"></div><div id="bottom">bottom</div>
<span id="log"></span>
<script>
  const t=document.getElementById('thumb'), s=document.getElementById('slider'); let drag=false;
  t.addEventListener('mousedown',()=>drag=true); window.addEventListener('mouseup',()=>drag=false);
  window.addEventListener('mousemove',e=>{ if(drag){ t.style.left=Math.max(0,Math.min(180,e.clientX-s.getBoundingClientRect().left-10))+'px'; }});
  document.getElementById('ev').addEventListener('foo',e=>document.getElementById('log').textContent+=' foo'+(e.bubbles?':bubbles':''));
  window.__keys=[]; window.addEventListener('keydown',e=>window.__keys.push(e.key));
</script>
`;

test.describe('input actions', () => {
  test.beforeEach(async ({ page }) => servePage(page, PAGE));

  test('setChecked is idempotent in both directions', async ({ page }) => {
    const box = role.checkbox(page, 'Subscribe');
    await actions.setChecked(box, true);
    await actions.setChecked(box, true);
    await assertions.toBeChecked(box);
    await actions.setChecked(box, false);
    await assertions.not.toBeChecked(box);
  });

  test('selectText selects an input\'s content, so the next typing replaces it', async ({ page }) => {
    const input = locators.byLabel(page, 'First name');
    await actions.selectText(input);
    await actions.pressOnPage(page, 'Delete');
    await assertions.toHaveValue(input, '');
  });

  test('scrollIntoView, scrollPageTo, scrollWheel', async ({ page }) => {
    await actions.scrollPageTo(page, 'bottom');
    await assertions.toBeInViewport(page.locator('#bottom'));
    await actions.scrollPageTo(page, 'top');
    await expect(page.locator('#bottom')).not.toBeInViewport();
    await actions.scrollIntoView(page.locator('#bottom'));
    await assertions.toBeInViewport(page.locator('#bottom'));
    await actions.scrollPageTo(page, 'top');
    await actions.scrollWheel(page, 0, 800);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  });

  test('dispatchEvent fires a DOM event with data; blur fires blur', async ({ page }) => {
    await actions.dispatchEvent(page.locator('#ev'), 'foo', { bubbles: true });
    await assertions.toContainText(page.locator('#log'), 'foo:bubbles');
    await actions.focus(page.locator('#blurry'));
    await actions.blur(page.locator('#blurry'));
    await assertions.toContainText(page.locator('#log'), 'blurred');
  });

  test('clickWithModifiers and clickAt', async ({ page }) => {
    await actions.clickWithModifiers(page.locator('#b'), ['Shift']);
    await assertions.toContainText(page.locator('#log'), 'click:shift');
    await actions.clickAt(page.locator('#box'), { x: 30, y: 40 });
    await assertions.toContainText(page.locator('#log'), 'box:30,40');
  });

  test('canClick is a dry run: true when it could be clicked, false when something covers it - and it clicks nothing', async ({ page }) => {
    expect(await actions.canClick(page.locator('#covered'))).toBe(true);
    await page.evaluate(() => (document.getElementById('overlay')!.style.display = 'block'));
    expect(await actions.canClick(page.locator('#covered'))).toBe(false);
    await assertions.not.toContainText(page.locator('#log'), 'covered');
  });

  test('uploadFromMemory, clearFiles and chooseFiles (a chooser created on demand)', async ({ page }) => {
    const input = page.locator('#file');
    await actions.uploadFromMemory(input, { name: 'notes.txt', mimeType: 'text/plain', content: 'hello' });
    expect(await input.evaluate((el: HTMLInputElement) => Array.from(el.files ?? []).map((f) => f.name))).toEqual(['notes.txt']);
    await actions.clearFiles(input);
    expect(await input.evaluate((el: HTMLInputElement) => el.files?.length)).toBe(0);

    const file = path.join(os.tmpdir(), `chooser-${Date.now()}.txt`);
    fs.writeFileSync(file, 'x');
    await actions.chooseFiles(page, () => actions.click(page.locator('#chooser')), file);
    await assertions.toHaveText(page.locator('#chosen'), path.basename(file));
  });

  test('typeOnPage and pressOnPage send keys to whatever has focus', async ({ page }) => {
    await actions.focus(page.locator('#blurry'));
    await actions.typeOnPage(page, 'abc');
    await actions.pressOnPage(page, 'Shift+Tab');
    await assertions.toHaveValue(page.locator('#blurry'), 'abc');
    expect(await page.evaluate(() => (window as unknown as { __keys: string[] }).__keys.slice(0, 3))).toEqual(['a', 'b', 'c']);
  });

  test('dragBy drags a slider thumb with the mouse; moveMouse / moveMouseAway', async ({ page }) => {
    await actions.dragBy(page.locator('#thumb'), 100, 0);
    const left = await page.locator('#thumb').evaluate((el) => parseFloat((el as HTMLElement).style.left));
    expect(left).toBeGreaterThan(60);
    await actions.moveMouse(page, 5, 5);
    await actions.moveMouseAway(page);
  });

  test('fillForm fills text, selects, multi-selects, checkboxes, radios and textareas by label', async ({ page }) => {
    await actions.fillForm(page, {
      'First name': 'Grace',
      Country: 'United States',
      Interests: ['Maths', 'Engines'],
      Subscribe: true,
      Plan: true,
      Notes: 'long text',
    });
    await assertions.toHaveValue(page.locator('#first'), 'Grace');
    await assertions.toHaveValue(page.locator('#country'), 'us');
    await assertions.toHaveValues(page.locator('#interests'), ['Maths', 'Engines']);
    await assertions.toBeChecked(page.locator('#sub'));
    await assertions.toBeChecked(page.locator('#pro'));
    await assertions.toHaveValue(page.locator('#notes'), 'long text');
  });

  test('fillForm names the label it could not find, or found more than once', async ({ page }) => {
    await expect(actions.fillForm(page, { Nonexistent: 'x' })).rejects.toThrow(/no control labelled "Nonexistent"/);
    await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<label>Dup <input></label><label>Dup <input></label>'));
    await expect(actions.fillForm(page, { Dup: 'x' })).rejects.toThrow(/2 controls are labelled "Dup"/);
  });
});
