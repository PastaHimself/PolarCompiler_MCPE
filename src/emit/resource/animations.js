import { resourcePath } from "../shared/paths.js";

export function emitResourceAnimations(ir, files) {
  for (const animation of ir.resourcePack.animations) {
    files.writeJson(resourcePath(animation.path), animation.json);
  }
}
