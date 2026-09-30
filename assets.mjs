import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

// Finalise a fresh staging directory. Every relative module import, worker URL
// and binary fetch stays within one immutable, content-addressed asset set.
export function versionAssets(out) {
  const files = [];
  function walk(dir, prefix = '') {
    for (const name of fs.readdirSync(dir).sort()) {
      const relative = prefix + name;
      if (fs.statSync(path.join(dir, name)).isDirectory()) walk(path.join(dir, name), relative + '/');
      else files.push(relative);
    }
  }
  walk(out);
  const hash = createHash('sha256');
  for (const name of files) {
    const bytes = fs.readFileSync(path.join(out, name));
    hash.update(JSON.stringify([name, bytes.length]) + '\n').update(bytes);
  }
  const version = hash.digest('hex');
  const prefix = 'assets/' + version + '/';
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  const names = fs.readdirSync(out).filter(name => name !== 'index.html');
  fs.mkdirSync(path.join(out, prefix), {recursive:true});
  for (const name of names) fs.renameSync(path.join(out, name), path.join(out, prefix, name));
  fs.writeFileSync(path.join(out, 'index.html'), html.replace(/(href|src)="([^"]+)"/g, (match, attr, url) =>
    files.includes(url) && url !== 'index.html' ? `${attr}="${prefix}${url}"` : match));
  fs.writeFileSync(path.join(out, 'asset-version.txt'), version + '\n');
  return version;
}
