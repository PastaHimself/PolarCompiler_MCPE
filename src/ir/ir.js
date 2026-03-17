export function createAddonIR(metadata) {
  return {
    metadata,
    behaviorPack: {
      items: [],
      blocks: [],
      entities: [],
      recipes: [],
      lootTables: [],
      functions: [],
      spawnRules: [],
      scripts: []
    },
    resourcePack: {
      itemTextures: [],
      blockTextures: [],
      itemDefinitions: [],
      blockDefinitions: [],
      entities: [],
      animations: [],
      animationControllers: [],
      localization: new Map()
    }
  };
}
