# Panackelty Browser

Browser/WebAssembly playground for [Panackelty](https://github.com/sproates/panackelty).

This repository owns the browser-specific WASI build, host adapter, JavaScript runtime, playground UI and real-browser validation. Panackelty core remains the source of the language/compiler, VM implementation, standard library and bytecode contract.

## Core dependency

CI pins an exact Panackelty core commit and materializes its versioned `browser-runtime-bundle`. The bundle contains matched VM build inputs, compiler seed and standard library with provenance hashes. This repository never follows core `main` implicitly.

The initial migration pins the merged Panackelty core boundary commit `261e0cef080e3ba2e5afcb24eb4467491a106f7f`. Future dependency updates are deliberate and validated by this repository's browser suite.

## Build

Requires Node 24, WASI SDK 34.0 and a materialized core bundle at `core-runtime/`.

```sh
npm ci --ignore-scripts
WASI_SDK_PATH=/path/to/wasi-sdk-34.0-x86_64-linux npm run build
npm test
npx playwright install --with-deps chromium firefox webkit
npm run test:browser
```

Generated assets are content-addressed and are not committed.

## Website artifact publication

After a successful `main` build, runtime tests and Chromium/Firefox/WebKit
tests, Check packages the exact tested `build/playground` tree and publishes
`playground.tar.gz` plus `SHA256SUMS` under the browser package version tag
(initially `v0.1.0`). Pull requests exercise packaging but never publish releases.
The release job has write access; browser builds and tests have read access only.

The main Panackelty repository owns the website, coverage and `/playground/`
deployment. It consumes this archive at a reviewed tag and SHA-256, rather than
rebuilding browser code or implicitly following this repository's `main`.
Updates need a deliberate website dependency-pin PR. That final consumption
step is separate from publishing this artifact.

Run `npm run package` after the tests to create the archive locally. Packaging
normalizes timestamps and owners; build provenance excludes installation paths.
Bump the version in `package.json` and `package-lock.json` whenever published
artifact bytes change. A rerun accepts matching existing assets, recovers an
incomplete draft, and refuses to overwrite different bytes at an existing tag.
No website deployment occurs from this repository.
