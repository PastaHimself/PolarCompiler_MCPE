import { resourcePath } from "../shared/paths.js";

export function emitResourceEntities(ir, files) {
  for (const entity of ir.resourcePack.entities) {
    files.writeJson(resourcePath(entity.path), entity.json);
  }
}
