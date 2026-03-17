import { behaviorPath } from "../shared/paths.js";

export function emitBehaviorItems(ir, files) {
  for (const item of ir.behaviorPack.items) {
    files.writeJson(behaviorPath(item.path), item.json);
  }
}
