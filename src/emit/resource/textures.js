import { resourcePath } from "../shared/paths.js";

export function emitTextures(ir, files) {
  if (ir.resourcePack.itemTextures.length > 0) {
    const textureData = {};
    for (const item of ir.resourcePack.itemTextures) {
      textureData[item.key] = {
        textures: item.path
      };
    }

    files.writeJson(resourcePath("textures/item_texture.json"), {
      resource_pack_name: ir.metadata.slug,
      texture_name: "atlas.items",
      texture_data: textureData
    });
  }

  if (ir.resourcePack.blockTextures.length > 0) {
    const textureData = {};
    for (const block of ir.resourcePack.blockTextures) {
      textureData[block.key] = {
        textures: block.path
      };
    }

    files.writeJson(resourcePath("textures/terrain_texture.json"), {
      resource_pack_name: ir.metadata.slug,
      texture_name: "atlas.terrain",
      texture_data: textureData
    });
  }
}
