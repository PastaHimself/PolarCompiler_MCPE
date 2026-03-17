import path from "node:path";
import { createDefaultConfig } from "./defaults.js";
import { createDeterministicUuid } from "../util/uuid.js";

export function normalizeConfig(rawConfig, configPath) {
  const defaults = createDefaultConfig();
  const configDir = path.dirname(configPath);
  const merged = {
    ...defaults,
    ...rawConfig,
    project: {
      ...defaults.project,
      ...rawConfig.project
    },
    packs: {
      behavior: {
        ...defaults.packs.behavior,
        ...rawConfig.packs?.behavior
      },
      resource: {
        ...defaults.packs.resource,
        ...rawConfig.packs?.resource
      }
    },
    scripts: {
      ...defaults.scripts,
      ...rawConfig.scripts,
      modules: [...(rawConfig.scripts?.modules ?? defaults.scripts.modules)]
    }
  };

  const targetVersion = parseTargetVersion(merged.project.target);
  const minEngineVersion = merged.project.minEngineVersion ?? targetVersion;
  const slug = merged.project.slug;

  return {
    ...merged,
    project: {
      ...merged.project,
      minEngineVersion
    },
    paths: {
      configPath,
      configDir,
      srcDir: path.resolve(configDir, merged.srcDir),
      entryPath: path.resolve(configDir, merged.entry),
      outDir: path.resolve(configDir, merged.outDir),
      behaviorPackDir: path.resolve(configDir, merged.outDir, "behavior_pack"),
      resourcePackDir: path.resolve(configDir, merged.outDir, "resource_pack"),
      buildInfoPath: path.resolve(configDir, merged.outDir, ".bedrockc-output.json")
    },
    packs: {
      behavior: {
        ...merged.packs.behavior,
        headerUuid:
          merged.packs.behavior.headerUuid ?? createDeterministicUuid(`${slug}:behavior:header`),
        moduleUuid:
          merged.packs.behavior.moduleUuid ?? createDeterministicUuid(`${slug}:behavior:module`)
      },
      resource: {
        ...merged.packs.resource,
        headerUuid:
          merged.packs.resource.headerUuid ?? createDeterministicUuid(`${slug}:resource:header`),
        moduleUuid:
          merged.packs.resource.moduleUuid ?? createDeterministicUuid(`${slug}:resource:module`)
      }
    }
  };
}

export function parseTargetVersion(target) {
  const parts = `${target}`.split(".").map((part) => Number(part));
  while (parts.length < 3) {
    parts.push(0);
  }
  return parts.slice(0, 3).map((part) => (Number.isFinite(part) ? part : 0));
}
