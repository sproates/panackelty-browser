import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {versionAssets} from '../assets.mjs';

test('asset identities cover the complete dependency set and are reproducible', t => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'panack-assets-'));
  t.after(() => fs.rmSync(work, {recursive:true, force:true}));
  const files = {
    'index.html':'<a href="../">Home</a><link href="style.css"><script src="app.mjs"></script>',
    'app.mjs':"import './examples.mjs'; import './controller.mjs';",
    'examples.mjs':'export const examples = {};',
    'controller.mjs':"new Worker(new URL('./worker.mjs', import.meta.url));",
    'worker.mjs':"import './runtime.mjs'; fetch(new URL('compiler.bc', import.meta.url));",
    'runtime.mjs':"import './vendor/index.js';", 'vendor/index.js':'export {};',
    'compiler.bc':'compiler', 'stdlib.json':'{}', 'vm.wasm':'wasm', 'style.css':'body {}',
    'provenance.json':'{}', 'vendor/LICENSE-MIT':'MIT', 'LICENSE':'MIT', 'site.css':'body {}', 'favicon.svg':'svg'
  };
  function build(name, entries) {
    const dir = path.join(work, name);
    for (const [file, content] of entries) {
      fs.mkdirSync(path.dirname(path.join(dir, file)), {recursive:true});
      fs.writeFileSync(path.join(dir, file), content);
    }
    return {dir, version:versionAssets(dir)};
  }
  const initial = build('first', Object.entries(files));
  assert.equal(build('repeat', Object.entries(files).reverse()).version, initial.version);
  const html = fs.readFileSync(path.join(initial.dir, 'index.html'), 'utf8');
  assert(html.includes(`src="assets/${initial.version}/app.mjs"`));
  assert(html.includes('href="../"'));
  for (const file of Object.keys(files)) {
    const changed = build('change-' + file.replaceAll('/', '-'), Object.entries({...files, [file]:files[file]+'\n'}));
    assert.notEqual(changed.version, initial.version, file);
    if (file !== 'index.html') assert.equal(fs.existsSync(path.join(initial.dir, file)), false, file);
  }
});
