import { resourcePath } from "../shared/paths.js";

export function emitResourceBlocks(ir, files) {
  if (ir.resourcePack.blockDefinitions.length === 0) {
    return;
  }

  const definitions = {};
  for (const block of ir.resourcePack.blockDefinitions) {
    definitions[block.identifier] = {
      textures: block.textureKey,
      ...block.definition
    };
  }

  files.writeJson(resourcePath("blocks.json"), definitions);
}
