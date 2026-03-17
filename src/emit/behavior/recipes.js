import { behaviorPath } from "../shared/paths.js";

export function emitBehaviorRecipes(ir, files) {
  for (const recipe of ir.behaviorPack.recipes) {
    files.writeJson(behaviorPath(recipe.path), recipe.json);
  }
}
