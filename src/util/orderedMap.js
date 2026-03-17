export class OrderedMap {
  constructor(entries = []) {
    this.map = new Map(entries);
  }

  set(key, value) {
    this.map.set(key, value);
    return this;
  }

  get(key) {
    return this.map.get(key);
  }

  has(key) {
    return this.map.has(key);
  }

  delete(key) {
    return this.map.delete(key);
  }

  keys() {
    return this.map.keys();
  }

  values() {
    return this.map.values();
  }

  entries() {
    return this.map.entries();
  }

  toArray() {
    return [...this.map.entries()];
  }
}
