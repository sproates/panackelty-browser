import {pathToFileURL} from 'node:url';
import {test,expect} from '@playwright/test';
import {exampleGuides} from '../examples.mjs';

async function run(page,source){
  await page.locator('#source').fill(source);
  await page.getByRole('button',{name:'Run program',exact:true}).click();
  await expect(page.getByRole('button',{name:'Run program',exact:true})).toBeEnabled();
}
test('footer resources use full-width rows on desktop and mobile', async({page}) => {
  for (const width of [1280, 768, 390, 320]) {
    await page.setViewportSize({width, height: 844});
    await page.goto('/playground/');
    const resources = page.getByRole('list', {name: 'Playground resources'});
    const names = ['Back to Panackelty', 'Language reference', 'Browser source',
      'Build inputs', 'License', 'WASI adapter license'];
    await expect(resources.getByRole('link')).toHaveCount(names.length);
    for (const name of names) await expect(resources.getByRole('link', {name, exact:true})).toBeVisible();
    await resources.scrollIntoViewIfNeeded();
    const layout = await resources.evaluate(list => {
      const links = [...list.querySelectorAll('a')];
      return {
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        boxes: links.map(link => {
          const {left, right, top, bottom, height} = link.getBoundingClientRect();
          return {left, right, top, bottom, height};
        }),
        destinations: links.map(link => link.getAttribute('href'))
      };
    });
    expect(layout.destinations).toEqual([
      '../', 'https://github.com/sproates/panackelty/blob/main/SPEC.md',
      'https://github.com/sproates/panackelty-browser',
      expect.stringMatching(/^assets\/[a-f0-9]{64}\/provenance\.json$/),
      expect.stringMatching(/^assets\/[a-f0-9]{64}\/LICENSE$/),
      expect.stringMatching(/^assets\/[a-f0-9]{64}\/vendor\/LICENSE-MIT$/)
    ]);
    expect(layout.scrollWidth).toBeLessThanOrEqual(width);
    for (const [index, box] of layout.boxes.entries()) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(width);
      expect(box.height).toBeGreaterThanOrEqual(44);
      for (const other of layout.boxes.slice(index + 1)) {
        // Adjacent fractional CSS-pixel edges can differ by floating-point
        // roundoff in Gecko. Gecko reported a 0.000015px overlap for adjoining rows.
        // Reject overlap beyond 0.001 CSS px (well below a layout unit).
        const horizontal = Math.min(box.right, other.right) - Math.max(box.left, other.left);
        const vertical = Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top);
        expect(Math.min(horizontal, vertical), JSON.stringify({width, box, other})).toBeLessThanOrEqual(0.001);
      }
    }
    expect(new Set(layout.boxes.map(box => box.left)).size).toBe(1);
    expect(new Set(layout.boxes.map(box => box.right)).size).toBe(1);
    expect(new Set(layout.boxes.map(box => box.top)).size).toBe(names.length);
    await resources.getByRole('link').first().focus();
    for (const link of await resources.getByRole('link').all()) {
      await expect(link).toBeFocused();
      await page.keyboard.press('Tab');
    }
  }
});
test('real worker compiles stdlib and exact values, reports source errors, renders literal text',async({page})=>{
  await page.goto('/playground/');
  await page.getByRole('button',{name:'Run program',exact:true}).click();
  await expect(page.locator('#status')).toHaveText('Finished');
  await expect(page.locator('#output')).toHaveText('Hello, browser!\n');
  await run(page,'main(): Void { x: Nat = "bad"; print(x) }');
  await expect(page.locator('#output')).toContainText('cannot assign Str to Nat');
  await run(page,'main(): Void { print("<b>λ🙂</b>"); print((1/8).dec()) }');
  await expect(page.locator('#output')).toHaveText('<b>λ🙂</b>\n0.125\n');
  await expect(page.locator('#output b')).toHaveCount(0);
});
test('stop interrupts running code and fresh execution succeeds',async({page})=>{
  await page.goto('/playground/');await page.locator('#source').fill('main(): Void { while true {} }');
  await page.getByRole('button',{name:'Run program',exact:true}).click();
  await expect(page.locator('#status')).toHaveText('Running…');
  await page.getByRole('button',{name:'Stop',exact:true}).click();
  await expect(page.locator('#output')).toContainText('Stopped.');
  await run(page,'main(): Void { print("fresh") }');await expect(page.locator('#output')).toHaveText('fresh\n');
});
test('output, input, host and timeout failures leave the UI usable',async({page})=>{
  await page.goto('/playground/');
  await run(page,'main(): Void { while true { print("flood") } }');await expect(page.locator('#output')).toContainText('Output exceeds');
  await run(page,'x'.repeat(32769));await expect(page.locator('#output')).toContainText('Source exceeds');
  await run(page,'import "stdlib/host"\nmain(): Void { print(host_decode_utf8(utf8_encode("hi"))) }');
  await expect(page.locator('#output')).toContainText('host capability unavailable');
  await page.locator('#source').fill('main(): Void { while true {} }');
  await page.getByRole('button',{name:'Run program',exact:true}).click();
  await expect(page.locator('#output')).toContainText('Time limit reached',{timeout:20000});
  await run(page,'main(): Void { print("after timeout") }');await expect(page.locator('#output')).toHaveText('after timeout\n');
});
test('asset failures are explicit and narrow layout stays within viewport',async({page})=>{
  await page.route('**/compiler.bc',route=>route.abort());
  await page.goto('/playground/');await page.getByRole('button',{name:'Run program',exact:true}).click();
  await expect(page.getByRole('button',{name:'Run program',exact:true})).toBeEnabled();
  await expect(page.locator('#status')).toHaveText('Stopped or failed');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('homepage navigation and every selectable example work at website paths',async({page})=>{
  await page.goto('/');
  await page.getByRole('link',{name:'Try it online',exact:true}).click();
  await expect(page).toHaveURL(/\/playground\/$/);
  await expect(page.locator('#example option')).toHaveCount(9);
  for(const [name,guide] of Object.entries(exampleGuides)){
    await page.locator('#example').selectOption(name);
    await page.getByRole('button',{name:'Load example',exact:true}).click();
    await expect(page.locator('#source')).toBeFocused();
    await expect(page.locator('#example-title')).toHaveText(guide.title);
    await expect(page.locator('#example-description')).toHaveText(guide.description);
    await expect(page.locator('#example-edit')).toHaveText(guide.edit);
    await expect(page.locator('#expected-output')).toHaveText(guide.expected);
    await page.getByRole('button',{name:'Run program',exact:true}).click();
    await expect(page.locator('#status')).toHaveText('Finished');
    await expect(page.locator('#output')).toHaveText(guide.expected);
  }
  const edited = await page.locator('#source').inputValue();
  await page.locator('#example').selectOption('hello');
  await expect(page.locator('#source')).toHaveValue(edited);
  await expect(page.locator('#example-title')).toHaveText(exampleGuides.order.title);
  await page.getByText('What can I run here?',{exact:true}).click();
  await expect(page.getByText('This is not a persistent REPL.',{exact:false})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('link',{name:'Back to Panackelty',exact:true}).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link',{name:'Try it online',exact:true})).toBeVisible();
});

test('core types and chained methods need no imports',async({page})=>{
  await page.goto('/playground/');
  await run(page,'pure less(a: Nat,b: Nat): Bool { a < b } main(): Void { value: Result[Nat,Str] = Ok(42); print(value); print([3,1,2].sort_by(@less).first()); print("hello.panack".ends_with(".panack")); print("42".parse_nat()) }');
  await expect(page.locator('#output')).toHaveText('Ok(42)\nSome(1)\ntrue\n42\n');
  await run(page,'main(): Void { print(1.ends_with("x")) }');
  await expect(page.locator('#output')).toContainText('expected Str');
});

test('a cached deployment reloads a matching new example, worker and library', async({page}) => {
  // Real HTTP caching: Playwright route interception would disable the cache.
  const fs = await import('node:fs');
  const path = await import('node:path');
  const os = await import('node:os');
  const http = await import('node:http');
  const {versionAssets} = await import('../assets.mjs');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'panack-upgrade-'));
  const built = process.env.PLAYGROUND_BUILD_DIR
    ? pathToFileURL(process.env.PLAYGROUND_BUILD_DIR.replace(/\/$/, '') + '/')
    : new URL('../build/playground/', import.meta.url);
  const oldVersion = fs.readFileSync(new URL('asset-version.txt', built), 'utf8').trim();
  const previous = path.join(work, 'previous');
  const next = path.join(work, 'next');
  fs.cpSync(built, previous, {recursive:true});
  fs.cpSync(new URL(`assets/${oldVersion}/`, built), next, {recursive:true});
  fs.copyFileSync(new URL('../index.html', import.meta.url), path.join(next, 'index.html'));
  const examplesFile = path.join(next, 'examples.mjs');
  fs.writeFileSync(examplesFile, fs.readFileSync(examplesFile, 'utf8').replace('print("Hello, browser!")', 'print(cache_revision())'));
  const libraryFile = path.join(next, 'stdlib.json');
  const library = JSON.parse(fs.readFileSync(libraryFile, 'utf8'));
  library['core.panack'] += '\npure cache_revision(): Str { "Updated library!" }\n';
  fs.writeFileSync(libraryFile, JSON.stringify(library));
  const nextVersion = versionAssets(next);
  let active = previous;
  const requests = [];
  const types = {'.html':'text/html', '.mjs':'text/javascript', '.js':'text/javascript', '.wasm':'application/wasm', '.json':'application/json', '.css':'text/css'};
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    requests.push(url.pathname);
    const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = path.resolve(active, name);
    if (!file.startsWith(active + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {res.writeHead(404).end();return;}
    res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream',
      'Cache-Control':name === 'index.html' ? 'no-cache' : 'public, max-age=3600, immutable'});
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.getByRole('button', {name:'Run program', exact:true}).click();
    await expect(page.locator('#output')).toHaveText('Hello, browser!\n');
    requests.length = 0;
    await page.reload();
    await page.getByRole('button', {name:'Run program', exact:true}).click();
    await expect(page.locator('#output')).toHaveText('Hello, browser!\n');
    expect(requests.filter(name => name.endsWith('/examples.mjs'))).toEqual([]);
    active = next;
    requests.length = 0;
    await page.reload();
    await page.getByRole('button', {name:'Load example', exact:true}).click();
    await expect(page.locator('#source')).toHaveValue(/print\(cache_revision\(\)\)/);
    await page.getByRole('button', {name:'Run program', exact:true}).click();
    await expect(page.locator('#output')).toHaveText('Updated library!\n');
    for (const name of ['app.mjs', 'examples.mjs', 'controller.mjs', 'worker.mjs', 'runtime.mjs', 'vendor/index.js', 'compiler.bc', 'stdlib.json', 'vm.wasm', 'style.css', 'site.css']) {
      expect(requests).toContain(`/assets/${nextVersion}/${name}`);
    }
    expect(requests.some(name => name.includes(oldVersion))).toBe(false);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(work, {recursive:true, force:true});
  }
});
