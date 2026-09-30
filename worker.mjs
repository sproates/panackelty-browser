import {compileAndRun, sourceBytes} from './runtime.mjs';

async function fetchAsset(name, json = false) {
  const response = await fetch(new URL(name, import.meta.url));
  if (!response.ok) throw new Error(`Could not load ${name} (${response.status}).`);
  return json ? response.json() : response.arrayBuffer();
}
self.onmessage = async ({data}) => {
  try {
    sourceBytes(data.source);
    self.postMessage({type:'phase',text:'Loading…'});
    const [wasm,compiler,stdlib] = await Promise.all([fetchAsset('vm.wasm'),fetchAsset('compiler.bc'),fetchAsset('stdlib.json',true)]);
    const module = await WebAssembly.compile(wasm);
    const result = await compileAndRun(module, compiler, stdlib, data.source,
      text => self.postMessage({type:'phase',text}));
    self.postMessage({type:'done',...result});
  } catch (error) {
    self.postMessage({type:'done',status:1,stdout:'',stderr:String(error.message||error)});
  }
};
