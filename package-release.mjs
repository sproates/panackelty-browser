import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const source = path.resolve('build/playground');
const version = fs.readFileSync(path.join(source, 'asset-version.txt'), 'utf8').trim();
if (!/^[0-9a-f]{64}$/.test(version)) throw new Error('Invalid asset version');
for (const name of ['index.html', `assets/${version}/vm.wasm`, `assets/${version}/compiler.bc`]) {
  if (!fs.statSync(path.join(source, name)).isFile()) throw new Error(`Missing ${name}`);
}
// Stable metadata makes the checksum independent of checkout time and owner.
const output = path.resolve('build/release');
fs.mkdirSync(output, {recursive: true});
const archive = path.join(output, 'playground.tar.gz');
const packed = spawnSync('tar', ['--sort=name', '--mtime=@0', '--owner=0', '--group=0',
  '--numeric-owner', '-czf', archive, '-C', source, '.'], {stdio: 'inherit'});
if (packed.status !== 0) throw new Error('Playground packaging failed');
const checksum = createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
fs.writeFileSync(path.join(output, 'SHA256SUMS'), `${checksum}  playground.tar.gz\n`);
console.log(checksum);
