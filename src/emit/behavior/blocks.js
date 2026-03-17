import { behaviorPath } from "../shared/paths.js";

export function emitBehaviorBlocks(ir, files) {
  for (const block of ir.behaviorPack.blocks) {
    files.writeJson(behaviorPath(block.path), block.json);
  }
}
