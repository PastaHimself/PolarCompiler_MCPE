import { behaviorPath } from "../shared/paths.js";

export function emitBehaviorEntities(ir, files) {
  for (const entity of ir.behaviorPack.entities) {
    files.writeJson(behaviorPath(entity.path), entity.json);
  }
}
