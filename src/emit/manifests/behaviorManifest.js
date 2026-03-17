import { createDeterministicUuid } from "../../util/uuid.js";

export function buildBehaviorManifest(ir) {
  const { metadata } = ir;
  const manifest = {
    format_version: 2,
    header: {
      name: metadata.packs.behavior.name,
      description: metadata.packs.behavior.description,
      uuid: metadata.packs.behavior.headerUuid,
      version: metadata.version,
      min_engine_version: metadata.minEngineVersion
    },
    modules: [
      {
        type: "data",
        uuid: metadata.packs.behavior.moduleUuid,
        version: metadata.version
      }
    ]
  };

  if (metadata.scripts.enabled && ir.behaviorPack.scripts.length > 0) {
    for (const script of ir.behaviorPack.scripts) {
      manifest.modules.push({
        type: "script",
        language: "javascript",
        entry: script.entry,
        uuid: createDeterministicUuid(`${metadata.slug}:script:${script.entry}`),
        version: metadata.version
      });
    }
  }

  const externalModules = metadata.scripts.modules ?? [];
  if (externalModules.length > 0) {
    manifest.dependencies = externalModules.map((module) => ({
      module_name: module.module,
      version: normalizeModuleVersion(module.version)
    }));
  }

  return manifest;
}

function normalizeModuleVersion(version) {
  if (Array.isArray(version)) {
    return version.join(".");
  }
  return `${version}`;
}
