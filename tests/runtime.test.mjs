import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileAndRun,sourceBytes,SOURCE_LIMIT} from '../runtime.mjs';
import {Playground} from '../controller.mjs';
import {examples,exampleGuides} from '../examples.mjs';

test('source bounds remain byte based',()=>{assert.equal(sourceBytes('a'.repeat(SOURCE_LIMIT)).length,SOURCE_LIMIT);assert.throws(()=>sourceBytes('🙂'.repeat(SOURCE_LIMIT/4+1)),/Source exceeds/);});
test('nine migrated examples retain expected guides',()=>{assert.equal(Object.keys(examples).length,9);for(const k of Object.keys(examples))assert.ok(exampleGuides[k].expected);});
test('controller stops and ignores stale workers',()=>{const workers=[],events=[];const p=new Playground(e=>events.push(e),{createWorker:()=>{const w={postMessage(){},terminate(){this.terminated=true;}};workers.push(w);return w;}});p.run('one');p.stop();assert(workers[0].terminated);assert.match(events.at(-1).stderr,/Stopped/);});
test('built runtime executes compiler and exact arithmetic',async()=>{const v=fs.readFileSync('build/playground/asset-version.txt','utf8').trim();const base='build/playground/assets/'+v+'/';const module=await WebAssembly.compile(fs.readFileSync(base+'vm.wasm'));const compiler=fs.readFileSync(base+'compiler.bc');const stdlib=JSON.parse(fs.readFileSync(base+'stdlib.json'));const r=await compileAndRun(module,compiler,stdlib,'main(): Void { print((1/3 * 30).nat()); print("λ🙂") }');assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,'10\nλ🙂\n');});
