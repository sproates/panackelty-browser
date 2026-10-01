const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');

// Called only by the protected main push job after all browser tests pass.
// A release version is append-only: reruns can complete a draft, never replace
// different bytes under an already published version.
module.exports = async function publish(github, context, directory, version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid browser release version');
  const tag = `v${version}`;
  const repo = context.repo;
  let release;
  try {
    release = (await github.rest.repos.getReleaseByTag({...repo, tag})).data;
  } catch (error) {
    if (error.status !== 404) throw error;
    release = (await github.rest.repos.createRelease({...repo, tag_name: tag,
      target_commitish: context.sha, name: `Browser playground ${tag}`, draft: true,
      body: `Validated browser artifact from ${context.sha}. Website consumers pin the archive SHA-256.`})).data;
  }
  const assets = await github.paginate(github.rest.repos.listReleaseAssets,
    {...repo, release_id: release.id, per_page: 100});
  for (const name of ['playground.tar.gz', 'SHA256SUMS']) {
    const data = fs.readFileSync(path.join(directory, name));
    const digest = `sha256:${createHash('sha256').update(data).digest('hex')}`;
    const existing = assets.find(asset => asset.name === name);
    if (existing) {
      if (existing.digest !== digest) throw new Error(`${tag}/${name} differs; bump the browser version`);
      continue;
    }
    if (!release.draft) throw new Error(`Published release ${tag} is incomplete; do not mutate it`);
    await github.rest.repos.uploadReleaseAsset({...repo, release_id: release.id, name, data});
  }
  if (release.draft) await github.rest.repos.updateRelease({...repo, release_id: release.id, draft: false});
};
