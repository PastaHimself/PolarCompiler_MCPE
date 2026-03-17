import { behaviorPath } from "../shared/paths.js";

export function emitBehaviorLootTables(ir, files) {
  for (const table of ir.behaviorPack.lootTables) {
    files.writeJson(behaviorPath(table.path), table.json);
  }
}
