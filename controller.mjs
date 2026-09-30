export class Playground {
  constructor(notify, {createWorker = () => new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'}), timeout = 15000} = {}) {
    this.notify = notify; this.createWorker = createWorker; this.timeout = timeout;
    this.worker = null; this.timer = null;
  }
  run(source) {
    if (this.worker) return;
    this.notify({type:'phase',text:'Starting…'});
    try {
      const worker = this.createWorker();
      this.worker = worker;
      const finish = result => {
        if (this.worker !== worker) return;
        this.dispose(); this.notify(result);
      };
      worker.onmessage = ({data}) => {
        if (this.worker !== worker) return;
        if (data.type === 'done') finish(data); else this.notify(data);
      };
      worker.onerror = event => finish({type:'done',status:1,stderr:event.message||'Worker failed.'});
      this.timer = setTimeout(() => finish({type:'done',status:1,stderr:'Time limit reached (15 seconds).'}), this.timeout);
      worker.postMessage({source});
    } catch (error) {this.dispose();this.notify({type:'done',status:1,stderr:String(error.message||error)});}
  }
  dispose() {clearTimeout(this.timer);this.worker?.terminate();this.worker=null;}
  stop() {this.dispose();this.notify({type:'done',status:1,stderr:'Stopped. Run again for a fresh session.'});}
}
