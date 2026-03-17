import { emitBehaviorBlocks } from "./behavior/blocks.js";
import { emitBehaviorEntities } from "./behavior/entities.js";
import { emitBehaviorFunctions } from "./behavior/functions.js";
import { emitBehaviorItems } from "./behavior/items.js";
import { emitBehaviorLootTables } from "./behavior/lootTables.js";
import { emitBehaviorRecipes } from "./behavior/recipes.js";
import { emitBehaviorSpawnRules } from "./behavior/spawnRules.js";
import { buildBehaviorManifest } from "./manifests/behaviorManifest.js";
import { buildResourceManifest } from "./manifests/resourceManifest.js";
import { emitResourceAnimationControllers } from "./resource/animationControllers.js";
import { emitResourceAnimations } from "./resource/animations.js";
import { emitResourceBlocks } from "./resource/blocks.js";
import { emitResourceEntities } from "./resource/entities.js";
import { emitResourceItems } from "./resource/items.js";
import { emitLocalization } from "./resource/localization.js";
import { emitTextures } from "./resource/textures.js";
import { behaviorPath, resourcePath } from "./shared/paths.js";
import { VirtualFiles } from "./virtualFiles.js";

export function emitAddonProject(ir) {
  const files = new VirtualFiles();

  files.writeJson(behaviorPath("manifest.json"), buildBehaviorManifest(ir));
  files.writeJson(resourcePath("manifest.json"), buildResourceManifest(ir));

  emitBehaviorItems(ir, files);
  emitBehaviorBlocks(ir, files);
  emitBehaviorEntities(ir, files);
  emitBehaviorRecipes(ir, files);
  emitBehaviorLootTables(ir, files);
  emitBehaviorFunctions(ir, files);
  emitBehaviorSpawnRules(ir, files);

  emitResourceItems(ir, files);
  emitResourceBlocks(ir, files);
  emitResourceEntities(ir, files);
  emitResourceAnimations(ir, files);
  emitResourceAnimationControllers(ir, files);
  emitLocalization(ir, files);
  emitTextures(ir, files);

  for (const script of ir.behaviorPack.scripts) {
    if (script.lines.length > 0) {
      files.writeText(behaviorPath(script.entry), script.lines.join("\n"));
    }
  }

  return files;
}
