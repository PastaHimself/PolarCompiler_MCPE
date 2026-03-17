export class IncrementalState {
  constructor() {
    this.moduleCache = new Map();
    this.lastResult = null;
  }
}
