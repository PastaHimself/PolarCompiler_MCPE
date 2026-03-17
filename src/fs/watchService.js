import fs from "node:fs";
import path from "node:path";

export function createWatchService({ paths = [], rootDir, debounceMs = 75, onChange }) {
  const watchers = [];
  const watchTargets = new Map();

  if (rootDir) {
    const target = normalizeWatchTarget(path.resolve(rootDir));
    watchTargets.set(`${target.path}:${target.recursive}`, target);
  }

  for (const target of paths) {
    const normalized = normalizeWatchTarget(path.resolve(target));
    watchTargets.set(`${normalized.path}:${normalized.recursive}`, normalized);
  }

  let timer = null;
  const schedule = () => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      void onChange();
    }, debounceMs);
  };

  for (const target of watchTargets.values()) {
    const watcher = fs.watch(target.path, { recursive: target.recursive }, schedule);
    watchers.push(watcher);
  }

  return {
    close() {
      if (timer) {
        clearTimeout(timer);
      }
      for (const watcher of watchers) {
        watcher.close();
      }
    }
  };
}

function normalizeWatchTarget(target) {
  try {
    const stats = fs.statSync(target);
    if (stats.isDirectory()) {
      return { path: target, recursive: true };
    }
    return { path: path.dirname(target), recursive: false };
  } catch {
    const fallback = path.extname(target) ? path.dirname(target) : target;
    return { path: fallback, recursive: path.extname(target).length === 0 };
  }
}
