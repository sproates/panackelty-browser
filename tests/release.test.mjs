import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import publish from '../publish-release.cjs';

function fixture(t, existing = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-release-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  for (const name of ['playground.tar.gz', 'SHA256SUMS']) fs.writeFileSync(path.join(dir, name), name);
  const events = [];
  const repos = {
    getReleaseByTag: async () => ({data: {id: 7, draft: true}}),
    listReleaseAssets() {},
    uploadReleaseAsset: async args => events.push(args.name),
    updateRelease: async () => events.push('published'),
  };
  return {dir, events, repos, github: {rest: {repos}, paginate: async () => existing}};
}
const context = {repo: {owner: 'sproates', repo: 'panackelty-browser'}, sha: 'a'.repeat(40)};
test('publishes only after both assets upload', async t => {
  const f = fixture(t);
  await publish(f.github, context, f.dir, '0.1.0');
  assert.deepEqual(f.events, ['playground.tar.gz', 'SHA256SUMS', 'published']);
});
test('failed upload leaves draft unpublished', async t => {
  const f = fixture(t);
  f.repos.uploadReleaseAsset = async () => {throw new Error('upload failed');};
  await assert.rejects(publish(f.github, context, f.dir, '0.1.0'), /upload failed/);
  assert.deepEqual(f.events, []);
});
test('rerun never replaces an existing release asset', async t => {
  const f = fixture(t, [{name: 'playground.tar.gz', digest: 'sha256:wrong'}]);
  await assert.rejects(publish(f.github, context, f.dir, '0.1.0'), /bump the browser version/);
  assert.deepEqual(f.events, []);
});
test('matching published release is idempotent', async t => {
  const assets = ['playground.tar.gz', 'SHA256SUMS'].map(name => ({name,
    digest: 'sha256:' + createHash('sha256').update(name).digest('hex')}));
  const f = fixture(t, assets);
  f.repos.getReleaseByTag = async () => ({data: {id: 7, draft: false}});
  await publish(f.github, context, f.dir, '0.1.0');
  assert.deepEqual(f.events, []);
});
