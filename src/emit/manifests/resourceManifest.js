export function buildResourceManifest(ir) {
  const { metadata } = ir;
  return {
    format_version: 2,
    header: {
      name: metadata.packs.resource.name,
      description: metadata.packs.resource.description,
      uuid: metadata.packs.resource.headerUuid,
      version: metadata.version,
      min_engine_version: metadata.minEngineVersion
    },
    modules: [
      {
        type: "resources",
        uuid: metadata.packs.resource.moduleUuid,
        version: metadata.version
      }
    ],
    dependencies: [
      {
        uuid: metadata.packs.behavior.headerUuid,
        version: metadata.version
      }
    ]
  };
}
