import { behaviorPath } from "../shared/paths.js";

export function emitBehaviorSpawnRules(ir, files) {
  for (const rule of ir.behaviorPack.spawnRules) {
    files.writeJson(behaviorPath(rule.path), rule.json);
  }
}
