import { resourcePath } from "../shared/paths.js";

export function emitResourceItems(ir, files) {
  for (const item of ir.resourcePack.itemDefinitions) {
    files.writeJson(resourcePath(item.path), item.json);
  }
}
