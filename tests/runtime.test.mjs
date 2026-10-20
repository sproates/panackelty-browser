import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const version = fs.readFileSync(new URL('../build/playground/asset-version.txt', import.meta.url), 'utf8').trim();
const assets = new URL(`../build/playground/assets/${version}/`, import.meta.url);
const {compileAndRun,execute,sourceBytes,assertArtifactWriteBound,SOURCE_LIMIT,ARTIFACT_LIMIT} = await import(new URL('runtime.mjs', assets));
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
  assert.equal(Object.keys(examples).length,10);
  for(const [name,source] of Object.entries(examples)){
    const result=await run(source);
    assert.equal(result.status,0,name+': '+result.stderr);assert.equal(result.stdout,exampleGuides[name].expected,name);
    const file=path.join(work,name+'.panack');fs.writeFileSync(file,source);
    const native=spawnSync(path.join(root,'bin/panack'),['run',file],{cwd:root,encoding:'utf8'});
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
  const host=await run('import stdlib/host as host\nmain(): Void { host.decode_utf8("hi".encode_utf8()); }');
  assert.equal(host.status,1);assert.match(host.stderr,/host capability unavailable/);
  const write=await run('import stdlib/filesystem as filesystem\nimport stdlib/path as path\nmain(): Void { match path.from_text("/cannot-write") { Ok(value) => { filesystem.write(value, "data".encode_utf8()); () }, Error(_) => () }; print("done") }');
  assert.equal(write.status,1);assert.match(write.stderr,/host capability unavailable/);
});
test('source bound measures UTF-8 bytes, output flood aborts',async()=>{
  assert.equal(sourceBytes('a'.repeat(SOURCE_LIMIT)).length,SOURCE_LIMIT);
  assert.throws(()=>sourceBytes('a'.repeat(SOURCE_LIMIT+1)),/Source exceeds/);
  assert.throws(()=>sourceBytes('🙂'.repeat(SOURCE_LIMIT/4+1)),/Source exceeds/);
  assert.throws(()=>sourceBytes(null),/Source exceeds/);
  await assert.rejects(run('main(): Void { while true { print("flood") } }'),/Output exceeds/);
});
test('compiler output filesystem has a hard artifact byte bound',async()=>{
  assert.doesNotThrow(()=>assertArtifactWriteBound(0n,ARTIFACT_LIMIT));
  assert.doesNotThrow(()=>assertArtifactWriteBound(BigInt(ARTIFACT_LIMIT-1),1));
  assert.throws(()=>assertArtifactWriteBound(0n,ARTIFACT_LIMIT+1),/Compiled artifact exceeds 1 MiB/);
  assert.throws(()=>assertArtifactWriteBound(BigInt(ARTIFACT_LIMIT),1),/Compiled artifact exceeds 1 MiB/);
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
    if(declared){
      assert.equal(r.status,1,entry.name);
      assert.match(r.stderr,/^error: VM trap: (host capability unavailable in browser playground|filesystem requires Path)\n$/,entry.name);
      hosts++;
    }
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
    const result=spawnSync('./bin/panack',['compile',path.join(dir,'main.panack'),'-o',path.join(dir,'main.bc')],{cwd:root,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    const cli=spawnSync('./bin/panack',['run',path.join(dir,'main.panack')],{cwd:root,encoding:'utf8'});
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
test('namespace imports match native bytecode and run without source files in WASI',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'panack-namespace-wasi-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const source='import project/math as math\nmain(): Void { print(math.answer()) }\n';
  const dependency='pub pure answer(): Nat { 43 }\n';
  fs.writeFileSync(path.join(dir,'main.panack'),source);
  fs.writeFileSync(path.join(dir,'math.panack'),dependency);
  const nativeArtifact=path.join(dir,'main.bc');
  const native=spawnSync(path.join(root,'bin/panack'),['compile',path.join(dir,'main.panack'),'-o',nativeArtifact],{cwd:root,encoding:'utf8'});
  assert.equal(native.status,0,native.stderr);
  const nativeRun=spawnSync(path.join(root,'bin/panack'),['run',nativeArtifact],{cwd:root,encoding:'utf8'});
  assert.equal(nativeRun.status,0,nativeRun.stderr);assert.equal(nativeRun.stdout,'43\n');

  const artifact=new File([]);
  const files=new Map([
    ['compiler.bc',new File(compiler,{readonly:true})],
    ['main.panack',new File(new TextEncoder().encode(source),{readonly:true})],
    ['math.panack',new File(new TextEncoder().encode(dependency),{readonly:true})],
    ['main.bc',artifact],
    ['stdlib',new Directory(new Map(Object.entries(stdlib).map(([name,text])=>[name,new File(new TextEncoder().encode(text),{readonly:true})])))]
  ]);
  const compiled=await execute(module,['run','/compiler.bc','compile','/main.panack','-o','/main.bc'],files,{writable:artifact});
  assert.equal(compiled.status,0,compiled.stderr);
  assert.deepEqual(Buffer.from(artifact.data),fs.readFileSync(nativeArtifact));
  const bytecode=await execute(module,['run','/main.bc'],new Map([['main.bc',new File(artifact.data,{readonly:true})]]));
  assert.equal(bytecode.status,0,bytecode.stderr);assert.equal(bytecode.stdout,'43\n');
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
  const flattenedMain=main.replace(/^import "helpers\.panack" as helpers\n/m,'').replaceAll('helpers.describe(','describe(');
  assert.doesNotMatch(flattenedMain,/^import /m);
  const result=await run(helper+flattenedMain);
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.stdout,fs.readFileSync(path.join(root,'tests/functional/cases/core_methods/expected.stdout'),'utf8'));
  const missing=await compileAndRun(module,compiler,{},'main(): Void { print(1) }');
  assert.equal(missing.status,1);
  assert.match(missing.stderr,/missing source module.*core.panack/);
});

test('native TCP is explicitly unavailable in WASI', async()=>{
  const result=await run(`
    import stdlib/tcp as tcp
    pure expect(value: Bool): Unit { checked = [0][if value { 0 } else { 1 }]; () }
    async main(): Unit {
      match await tcp.exchange("127.0.0.1", 9000, bytes(), 32, 10) {
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
    import stdlib/tcp::{TcpServerLimits}
    import stdlib/tcp as tcp
    pure expect(value: Bool): Unit { checked = [0][if value { 0 } else { 1 }]; () }
    async reply(request: Bytes): Result[Bytes,Str] { Ok(request) }
    async main(): Unit {
      limits = TcpServerLimits(1, 1, 32, 32, 10, 10, 10)
      match await tcp.serve("127.0.0.1", 9000, @reply, limits) {
        Ok(reports) => expect(false),
        Error(problem) => expect(problem == "TCP server is unavailable on this host")
      }
      ()
    }`);
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.stdout,'');
});

// Use the maintained acceptance programs without flattening their imports or
// rewriting their syntax. Only the compiled artifact survives into execution.
test('owned dispatch fixtures retain imports, generics, effects and Server/Map behavior in WASI', async()=>{
  const names=['owned_method_dispatch','owned_imports','owned_generic_methods',
    'owned_intrinsics','owned_callbacks','owned_async_handlers','owned_core_methods',
    'owned_server_map','owned_server_map_alias','owned_server_map_facade',
    'owned_server_map_identity','owned_server_map_namespace'];
  const cases=path.join(root,'tests/functional/cases');
  const directory=dir=>new Directory(new Map(fs.readdirSync(dir,{withFileTypes:true})
    .map(entry=>[entry.name,entry.isDirectory()?directory(path.join(dir,entry.name)):
      new File(fs.readFileSync(path.join(dir,entry.name)),{readonly:true})])));
  for(const name of names){
    const dir=path.join(cases,name);
    const entry=fs.existsSync(path.join(dir,'source.path'))?
      fs.readFileSync(path.join(dir,'source.path'),'utf8').trim().replace('tests/functional/cases/',''):
      `${name}/main.panack`;
    const artifact=new File([]);
    const files=new Map([
      ['compiler.bc',new File(compiler,{readonly:true})],['result.bc',artifact],
      ['fixtures',new Directory(new Map(names.map(n=>[n,directory(path.join(cases,n))])))],
      ['stdlib',new Directory(new Map(Object.entries(stdlib).map(([n,s])=>
        [n,new File(new TextEncoder().encode(s),{readonly:true})])))]
    ]);
    const compiled=await execute(module,['run','/compiler.bc','compile',`/fixtures/${entry}`,
      '-o','/result.bc'],files,{writable:artifact});
    assert.equal(compiled.status,0,name+': '+compiled.stderr);
    const result=await execute(module,['run','/result.bc'],
      new Map([['result.bc',new File(artifact.data,{readonly:true})]]));
    assert.equal(result.status,0,name+': '+result.stderr);
    assert.equal(result.stdout,fs.readFileSync(path.join(dir,'expected.stdout'),'utf8'),name);
    assert.equal(result.stderr,'',name);
  }
});

test('dot-only compiler rejects arrows, removed globals and global fallback in WASI', async()=>{
  for(const [source,diagnostic] of [
    ['main(): Void { print("abc"->len()) }',/arrow receiver calls are not supported/],
    ['main(): Void { print(quotient(4, 2)) }',/removed global primitive/],
    ['record Fruit { value: Nat } pure apple(f: Fruit): Nat { f.value } main(): Void { print(Fruit(10).apple()) }',/owned method/]
  ]){
    const result=await run(source);
    assert.equal(result.status,1);assert.match(result.stderr,diagnostic);
    assert.equal(result.stdout,'');
  }
  const fruit=await run('record Fruit { value: Nat } impl Fruit { pure apple(): Nat { self.value } pure banana(): Nat { self.value + 1 } } main(): Void { a = Fruit(10); b = Fruit(20); print(a.apple()); print(a.banana()); print(b.apple()); print(b.banana()) }');
  assert.equal(fruit.status,0,fruit.stderr);
  assert.equal(fruit.stdout,'10\n11\n20\n21\n');
});
