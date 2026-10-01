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
make -C core native
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

## Validation ownership

This repository owns the complete suite migrated from core: 15 runtime tests
(including all 145 VM corpus cases: 131 exact results and 14 explicit host
rejections), the asset identity test, release safety tests, and eight browser
scenarios in each of Chromium, Firefox and WebKit. These cover every example,
native CLI output and bytecode equivalence, bounds, cancellation, timeout,
diagnostics, host restrictions, layout, navigation and real HTTP cache upgrades.
The smaller initial migration tests are replaced by this superset.

For runtime tests, materialize the exact core revision above at `core/` and run
`make -C core native`. Set `PANACKELTY_CORE_SOURCE` for another checkout location.
The native CLI, `tests/fixtures/vm_contracts` and
`tests/functional/cases/core_methods` are explicit **test-only** inputs from
that same revision; they are not copied into the browser product or read by its
build. Dependency updates must validate these contracts together with the bundle.

The website publisher checks out a reviewed commit of this repository and runs
`npm ci --ignore-scripts` plus `npm run test:browser` against its assembled site.
Set absolute `PLAYGROUND_SITE_DIR` to the complete website and
`PLAYGROUND_BUILD_DIR` to its downloaded playground. No WASI build, native oracle
or runtime test fixtures are needed by this integration mode. The browser test
revision and release pin must be reviewed together when behavior changes.

Check is the only artifact publisher. The obsolete temporary Actions-artifact
publisher has been removed. SDK and engine download caches use exact installer
and lockfile identities with OS/architecture; installs and all tests still run
on restored engine caches. No test-result cache or broad fallback key is used.

## Contract and limitations

Each Run creates a module worker. The existing compiler seed compiles the source
and stdlib in one VM instance, then a fresh VM verifies/executes the bytecode.
Stop, timeout, completion and errors terminate the worker. Stale worker replies
are ignored. The page renders output as text, not markup. Limits are 32 KiB UTF-8
source and combined output, a 1 MiB compiler artifact, a 2 MiB C stack, 256 MiB
linear memory per VM instance and a 15-second foreground timer. JavaScript/files
use additional memory; garbage collection and background timers are not bounded.
These controls are not a security certification or a total-tab memory limit.

Only the compiler's preallocated output file may receive filesystem writes.
Runtime filesystem writes fail. Input files are read-only and device files are
not mounted; standard input is EOF. The complete typed native host dispatcher is
unavailable (processes, typed filesystem services, sleep, host UTF-8 decode),
using an explicit trap. Legacy bootstrap reads/path operations remain available
inside the disposable filesystem. No real networking or persistent REPL exists.

The browser-profile C adapter is selected explicitly, never through the native
VM wildcard. The core compiler/VM implementation and original corpus expectations
are unchanged. Fourteen forged native-host operand cases retain rejection but
have the profile's explicit unsupported-capability diagnostic; 131 cases must
match native status/stdout/stderr exactly. Tests name the only allowed differences.

Actual browser CI covers Chromium, Firefox and WebKit, including a narrow WebKit
viewport, real module workers, asset loading, stdlib/exactness/Unicode, diagnostics,
literal output, stop/restart, timeout, input/output limits and load errors.
WebKit on Linux is not physical iPhone/Safari validation. Review the workflow's
actual result; having test code alone is not evidence that engines passed.

## Core-library integration

The text, collections and result examples use import-free core types and methods. The browser uses the same compiler seed and core module as native execution; no browser-only source rewriting is involved. Direct compiler filesystem fixtures must supply the bundled stdlib, including core.panack. Rebuild both compiler and stdlib browser assets together.

## Deployment caching

The build hashes the complete staged asset set, including the entry template,
examples, module graph, worker, VM, compiler, stdlib, shared styles and notices.
It publishes assets under `assets/<sha256>/` and rewrites the entry document's
local asset links. Relative imports and worker fetches remain within that version.
`asset-version.txt` identifies the directory for packaging and validation; runtime
code does not fetch a mutable manifest. Rebuilding clears the generated output,
so obsolete unversioned files are not published alongside the replacement.

A new entry document therefore selects one matching dependency set even when a
browser retains the previous deployment in its HTTP cache. The browser regression
uses a real caching server, warms the cache, switches deployments and verifies new
examples and library execution in Chromium, Firefox and WebKit. Assets are not
rewritten in place under an existing hash. Pages can still cache the entry HTML;
this does not force an already open tab to update or preserve every old asset set.
An old page whose dependencies are no longer available fails visibly and needs a
reload after the entry document refreshes. No service worker is installed.
