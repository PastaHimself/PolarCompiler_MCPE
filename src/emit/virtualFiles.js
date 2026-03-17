import { stableStringify } from "./stableJson.js";

export class VirtualFiles {
  constructor() {
    this.files = new Map();
  }

  writeJson(relativePath, value) {
    this.files.set(normalizePath(relativePath), stableStringify(value));
  }

  writeText(relativePath, text) {
    const normalized = normalizePath(relativePath);
    const content = text.endsWith("\n") ? text : `${text}\n`;
    this.files.set(normalized, content);
  }

  entries() {
    return [...this.files.entries()];
  }
}

function normalizePath(relativePath) {
  return `${relativePath}`.replace(/\\/g, "/").replace(/^\/+/, "");
}
