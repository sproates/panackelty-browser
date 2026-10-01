import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const version = fs.readFileSync(new URL('../build/playground/asset-version.txt', import.meta.url), 'utf8').trim();
const assets = new URL(`../build/playground/assets/${version}/`, import.meta.url);
const {compileAndRun,execute,sourceBytes,SOURCE_LIMIT} = await import(new URL('runtime.mjs', assets));
const {File,Directory} = await import(new URL('vendor/index.js', assets));
import {Playground} from '../controller.mjs';
import {examples, exampleGuides} from '../examples.mjs';

// Test-only native oracle and fixtures come from the same explicitly pinned core checkout.
const root=path.resolve(process.env.PANACKELTY_CORE_SOURCE || 'core');
const module=await WebAssembly.compile(fs.readFileSync(new URL('vm.wasm', assets)));
const compiler=fs.readFileSync(new URL('compiler.bc', assets));
const stdlib=JSON.parse(fs.readFileSync(new URL('stdlib.json', assets)));
const run=source=>compileAndRun(module,compiler,stdlib,source);

test('every website example matches expected output through browser and native public CLI',async t=>{
  const work=fs.mkdtempSync(path.join(os.tmpdir(),'panack-browser-examples-'));
  t.after(()=>fs.rmSync(work,{recursive:true,force:true}));
  assert.equal(Object.keys(examples).length,9);
  for(const [name,source] of Object.entries(examples)){
    const result=await run(source);
    assert.equal(result.status,0,name+': '+result.stderr);assert.equal(result.stdout,exampleGuides[name].expected,name);
    const file=path.join(work,name+'.panack');fs.writeFileSync(file,source);
    const native=spawnSync(path.join(root,'panack'),['run',file],{cwd:root,encoding:'utf8'});
    assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,exampleGuides[name].expected,name);
  }
});

test('suggested domain edits reject invalid values and exact invoice edits recalculate',async()=>{
  const invalid=await run(examples.guards.replace('seats: Seats = 4','seats: Seats = 0'));
  assert.notEqual(invalid.status,0);
  assert.notEqual(invalid.stderr,'');
  const invoice=await run(examples.invoice.replace('3.0 * 19.95','4.0 * 19.95'));
  assert.equal(invoice.status,0,invoice.stderr);
  assert.equal(invoice.stdout,'Subtotal: 87.300\nTax: 17.46000\nTotal: 104.76000\n');
});

test('existing compiler, exact numbers, Unicode and stdlib work',async()=>{
  const result=await run('main(): Void { print("λ🙂"); print((1/3 * 30).nat()); print((1/8).dec()); print(999999999999999999999999999999 + 1); print("hello.panack".ends_with(".panack")) }');
  assert.equal(result.status,0);assert.equal(result.stderr,'');
  assert.equal(result.stdout,'λ🙂\n10\n0.125\n1000000000000000000000000000000\ntrue\n');
});
test('source diagnostics prevent runtime execution',async()=>{
  const phases=[];
  const r=await compileAndRun(module,compiler,stdlib,'main(): Void { n: Nat = "bad"; print(n) }',p=>phases.push(p));
  assert.equal(r.status,1);assert.match(r.stderr,/\/main.panack:1:/);assert.deepEqual(phases,['Compiling…']);
});
test('unsupported host and runtime writes fail explicitly',async()=>{
  const host=await run('import "stdlib/host"\nmain(): Void { print(host_decode_utf8(utf8_encode("hi"))) }');
  assert.equal(host.status,1);assert.match(host.stderr,/host capability unavailable/);
  const write=await run('main(): Void { write_file("/cannot-write", "data") }');
  assert.equal(write.status,1);assert.match(write.stderr,/could not write file/);
});
test('source bound measures UTF-8 bytes, output flood aborts',async()=>{
  assert.equal(sourceBytes('a'.repeat(SOURCE_LIMIT)).length,SOURCE_LIMIT);
  assert.throws(()=>sourceBytes('a'.repeat(SOURCE_LIMIT+1)),/Source exceeds/);
  assert.throws(()=>sourceBytes('🙂'.repeat(SOURCE_LIMIT/4+1)),/Source exceeds/);
  assert.throws(()=>sourceBytes(null),/Source exceeds/);
  await assert.rejects(run('main(): Void { while true { print("flood") } }'),/Output exceeds/);
});
test('compiler output filesystem has a hard artifact byte bound',async()=>{
  const source='main(): Void { mut text: Str = "a"; mut i: Nat = 0; while i < 21 { text = text + text; i = i + 1; } write_file("/target", text) }';
  const program=new File([]);
  const compiled=await execute(module,['run','/compiler.bc','compile','/main.panack','-o','/main.bc'],new Map([
    ['stdlib',new Directory(new Map(Object.entries(stdlib).map(([name,text])=>[name,new File(new TextEncoder().encode(text),{readonly:true})])))],
    ['compiler.bc',new File(compiler,{readonly:true})],['main.panack',new File(new TextEncoder().encode(source),{readonly:true})],['main.bc',program]
  ]),{writable:program});
  assert.equal(compiled.status,0,compiled.stderr);
  const target=new File([]);
  await assert.rejects(execute(module,['run','/main.bc'],new Map([
    ['main.bc',new File(program.data,{readonly:true})],['target',target]
  ]),{writable:target}),/Compiled artifact exceeds 1 MiB/);
  assert(target.data.length<=1048576);
});
test('fixed VM corpus retains 131 exact results and 14 declared host rejections',async()=>{
  const dir=path.join(root,'tests/fixtures/vm_contracts');
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json')));
  let exact=0,hosts=0;
  for(const entry of manifest){
    const bytes=Buffer.from(fs.readFileSync(path.join(dir,entry.name+'.hex'),'utf8').replace(/\s/g,''),'hex');
    const r=await execute(module,[entry.mode,'/fixture.bc'],new Map([['fixture.bc',new File(bytes,{readonly:true})]]));
    assert.equal(r.status,entry.status,entry.name);
    assert.equal(r.stdout,fs.readFileSync(path.join(dir,entry.name+'.stdout'),'utf8'),entry.name);
    const expected=fs.readFileSync(path.join(dir,entry.name+'.stderr'),'utf8');
    const declared=/^(BytecodeContractTests-forged_runtime_safety_failures_trap_in_the_oracle|NativeExecutionTests-native_vm_traps_on_forged_dynamic_failures)-[1-7]$/.test(entry.name);
    if(declared){assert.equal(r.status,1);assert.equal(r.stderr,'error: VM trap: host capability unavailable in browser playground\n');hosts++;}
    else{assert.equal(r.stderr,expected,entry.name);exact++;}
  }
  assert.equal(exact,131);assert.equal(hosts,14);
});
test('wrong bytecode version is rejected',async()=>{
  const bytes=Buffer.from(compiler);bytes[9]=8;
  const r=await execute(module,['check','/old.bc'],new Map([['old.bc',new File(bytes)]]));
  assert.equal(r.status,1);assert.match(r.stderr,/unsupported bytecode version/);
});
test('linear memory cannot grow beyond the configured maximum',async()=>{
  const imports=Object.fromEntries(WebAssembly.Module.imports(module).map(entry=>{
    assert.equal(entry.kind,'function');assert.equal(entry.module,'wasi_snapshot_preview1');
    return [entry.name,()=>0];
  }));
  const instance=await WebAssembly.instantiate(module,{wasi_snapshot_preview1:imports});
  assert.throws(()=>instance.exports.memory.grow(4097),RangeError);
});
test('native public CLI and WASI compiler emit identical bytecode',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'panack-playground-'));
  try{
    const source='main(): Void { print((1/3 * 30).nat()); print("λ🙂") }\n';
    fs.writeFileSync(path.join(dir,'main.panack'),source);
    const result=spawnSync('./panack',['compile',path.join(dir,'main.panack'),'-o',path.join(dir,'main.bc')],{cwd:root,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    const cli=spawnSync('./panack',['run',path.join(dir,'main.panack')],{cwd:root,encoding:'utf8'});
    assert.equal(cli.status,0,cli.stderr);assert.equal(cli.stdout,'10\nλ🙂\n');
    const output=new File([]);
    const compiled=await execute(module,['run','/compiler.bc','compile','/main.panack','-o','/main.bc'],new Map([
      ['stdlib',new Directory(new Map(Object.entries(stdlib).map(([name,text])=>[name,new File(new TextEncoder().encode(text),{readonly:true})])))],
    ['compiler.bc',new File(compiler,{readonly:true})],['main.panack',new File(new TextEncoder().encode(source),{readonly:true})],['main.bc',output]
    ]),{writable:output});
    assert.equal(compiled.status,0,compiled.stderr);
    assert.deepEqual(Buffer.from(output.data),fs.readFileSync(path.join(dir,'main.bc')));
  }finally{fs.rmSync(dir,{recursive:true});}
});
test('controller cancellation, stale messages, errors and timeout',async()=>{
  const workers=[],events=[];
  const p=new Playground(e=>events.push(e),{timeout:10,createWorker:()=>{
    const worker={postMessage(){},terminate(){this.terminated=true;}};workers.push(worker);return worker;
  }});
  p.run('one');p.run('duplicate');assert.equal(workers.length,1);
  p.stop();assert(workers[0].terminated);
  p.run('two');const before=events.length;
  workers[0].onmessage({data:{type:'done',stdout:'stale'}});assert.equal(events.length,before);
  workers[1].onmessage({data:{type:'done',status:0,stdout:'fresh'}});assert(workers[1].terminated);assert.equal(events.at(-1).stdout,'fresh');
  p.run('timeout');await new Promise(resolve=>setTimeout(resolve,30));assert(workers[2].terminated);assert.match(events.at(-1).stderr,/Time limit/);
  p.run('error');workers[3].onerror({message:'load failed'});assert(workers[3].terminated);assert.equal(events.at(-1).stderr,'load failed');
});

test('core methods share native lookup and generic behaviour without imports', async()=>{
  const main=fs.readFileSync(path.join(root,'tests/functional/cases/core_methods/main.panack'),'utf8');
  const helper=fs.readFileSync(path.join(root,'tests/functional/cases/core_methods/helpers.panack'),'utf8');
  const result=await run(helper+main.replace('import "helpers.panack"',''));
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.stdout,fs.readFileSync(path.join(root,'tests/functional/cases/core_methods/expected.stdout'),'utf8'));
  const missing=await compileAndRun(module,compiler,{},'main(): Void { print(1) }');
  assert.equal(missing.status,1);
  assert.match(missing.stderr,/missing source module.*core.panack/);
});

test('native TCP is explicitly unavailable in WASI', async()=>{
  const result=await run(`
    pure expect(value: Bool): Unit { checked = [0][if value { 0 } else { 1 }]; () }
    async main(): Unit {
      match await tcp_exchange("127.0.0.1", 9000, bytes(), 32, 10) {
        Ok(data) => expect(false),
        Error(problem) => expect(problem == "TCP is unavailable on this host")
      }
      ()
    }`);
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.stdout,'');
});

test('TCP listening is explicitly unavailable in WASI', async()=>{
  const result=await run(`
    import stdlib/tcp
    pure expect(value: Bool): Unit { checked = [0][if value { 0 } else { 1 }]; () }
    async reply(request: Bytes): Result[Bytes,Str] { Ok(request) }
    async main(): Unit {
      limits = TcpServerLimits(1, 1, 32, 32, 10, 10, 10)
      match await tcp_serve("127.0.0.1", 9000, @reply, limits) {
        Ok(reports) => expect(false),
        Error(problem) => expect(problem == "TCP server is unavailable on this host")
      }
      ()
    }`);
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.stdout,'');
});
