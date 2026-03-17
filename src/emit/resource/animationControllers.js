import { resourcePath } from "../shared/paths.js";

export function emitResourceAnimationControllers(ir, files) {
  for (const controller of ir.resourcePack.animationControllers) {
    files.writeJson(resourcePath(controller.path), controller.json);
  }
}
