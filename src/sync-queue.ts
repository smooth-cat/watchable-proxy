export class SyncQueue extends Array<Function> {

  isExecuting = false;

  exec() {
    if(this.isExecuting) return;
    this.isExecuting = true;
    while (1) {
      const len = this.length;
      if(len === 0) {
        this.isExecuting = false;
        return;
      }
      const fn = this.shift();
      fn();
    }
  }
}