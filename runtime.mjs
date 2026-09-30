import {WASI, File, OpenFile, Directory, PreopenDirectory, ConsoleStdout, wasi as constants} from './vendor/index.js';

export const SOURCE_LIMIT = 32768;
export const OUTPUT_LIMIT = 32768;
export const ARTIFACT_LIMIT = 1048576;
const encoder = new TextEncoder();

export function sourceBytes(source) {
  if (typeof source !== 'string' || source.length > SOURCE_LIMIT) throw new Error('Source exceeds 32 KiB.');
  const bytes = encoder.encode(source);
  if (bytes.length > SOURCE_LIMIT) throw new Error('Source exceeds 32 KiB.');
  return bytes;
}

export async function execute(module, args, files, {writable = null, outputLimit = OUTPUT_LIMIT} = {}) {
  let stdout = '', stderr = '', outputBytes = 0;
  const streams = [new TextDecoder(), new TextDecoder()];
  const sink = index => new ConsoleStdout(bytes => {
    outputBytes += bytes.length;
    if (outputBytes > outputLimit) throw new Error('Output exceeds 32 KiB.');
    const text = streams[index].decode(bytes, {stream:true});
    if (index === 0) stdout += text; else stderr += text;
  });
  // Invocation arguments/environment are fixed ASCII. No process or device FS.
  const host = new WASI(['panack-vm', ...args], ['PANACKELTY_STDLIB_PATH=/stdlib'], [
    new OpenFile(new File([])), sink(0), sink(1), new PreopenDirectory('/', files)
  ], {debug:false});
  const write = host.wasiImport.fd_write;
  host.wasiImport.fd_write = (fd, iovs, count, written) => {
    if (fd > 2) {
      const file = host.fds[fd];
      if (!writable || file?.file !== writable) return constants.ERRNO_ROFS;
      const view = new DataView(host.inst.exports.memory.buffer);
      let length = 0;
      for (let i = 0; i < count; i++) length += view.getUint32(iovs+i*8+4, true);
      if (file.file_pos + BigInt(length) > BigInt(ARTIFACT_LIMIT)) throw new Error('Compiled artifact exceeds 1 MiB.');
    }
    return write(fd, iovs, count, written);
  };
  // No writable host other than the compiler's single bounded output file.
  for (const name of ['fd_pwrite','fd_allocate','fd_filestat_set_size','path_create_directory',
    'path_link','path_rename','path_symlink','path_unlink_file','path_remove_directory']) {
    host.wasiImport[name] = () => constants.ERRNO_ROFS;
  }
  const instance = await WebAssembly.instantiate(module, {wasi_snapshot_preview1:host.wasiImport});
  const status = host.start(instance);
  stdout += streams[0].decode(); stderr += streams[1].decode();
  return {status, stdout, stderr};
}

export async function compileAndRun(module, compiler, stdlib, source, phase = () => {}) {
  const input = sourceBytes(source);
  const started = performance.now();
  const artifact = new File([]);
  let files = new Map([
    ['compiler.bc', new File(compiler, {readonly:true})],
    ['main.panack', new File(input, {readonly:true})],
    ['main.bc', artifact],
    ['stdlib', new Directory(new Map(Object.entries(stdlib).map(([name,text]) => [name,new File(encoder.encode(text),{readonly:true})])))]
  ]);
  phase('Compiling…');
  const compiled = await execute(module, ['run','/compiler.bc','compile','/main.panack','-o','/main.bc'], files, {writable:artifact});
  const compileMs = performance.now()-started;
  if (compiled.status !== 0) return {...compiled,compileMs};
  const bytecode = artifact.data;
  files = null;
  phase('Running…');
  const runStart = performance.now();
  const result = await execute(module, ['run','/main.bc'], new Map([['main.bc',new File(bytecode,{readonly:true})]]));
  return {...result,compileMs,runMs:performance.now()-runStart};
}
