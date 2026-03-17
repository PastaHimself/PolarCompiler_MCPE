import { behaviorPath } from "../shared/paths.js";

export function emitBehaviorFunctions(ir, files) {
  for (const func of ir.behaviorPack.functions) {
    files.writeText(behaviorPath("functions", func.path), func.lines.join("\n"));
  }
}
