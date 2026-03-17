import { createAddonIR } from "./ir.js";

export function lowerToIr(model) {
  const addonData = model.addon?.data ?? {};
  const metadata = {
    slug: model.config.project.slug,
    namespace: addonData.namespace ?? model.config.project.namespace,
    version: addonData.version ?? model.config.project.version,
    target: addonData.target ?? model.config.project.target,
    minEngineVersion: addonData.min_engine_version ?? model.config.project.minEngineVersion,
    packs: model.config.packs,
    scripts: model.config.scripts
  };

  const ir = createAddonIR(metadata);

  for (const declaration of model.declarations) {
    const resolved = resolveReferences(declaration.data, model);

    switch (declaration.kind) {
      case "item":
        ir.behaviorPack.items.push(buildItemIr(declaration, resolved, metadata));
        if (resolved.texture || resolved.icon || resolved.resource) {
          ir.resourcePack.itemTextures.push({
            key: resolved.icon ?? declaration.name,
            path: resolved.texture ?? `textures/items/${declaration.name}`
          });
        }
        if (resolved.resource) {
          ir.resourcePack.itemDefinitions.push({
            path: `items/${pathName(resolved.path ?? declaration.name)}.json`,
            json: resolved.resource
          });
        }
        break;
      case "block":
        ir.behaviorPack.blocks.push(buildBlockIr(declaration, resolved, metadata));
        if (resolved.texture) {
          ir.resourcePack.blockTextures.push({
            key: declaration.name,
            path: resolved.texture
          });
        }
        if (resolved.client) {
          ir.resourcePack.blockDefinitions.push({
            identifier: resolved.id,
            definition: resolved.client,
            textureKey: declaration.name
          });
        }
        break;
      case "entity":
        ir.behaviorPack.entities.push(buildEntityIr(declaration, resolved, metadata));
        ir.resourcePack.entities.push(buildClientEntityIr(declaration, resolved, metadata));
        break;
      case "recipe":
        ir.behaviorPack.recipes.push({
          path: `recipes/${pathName(resolved.path ?? declaration.name)}.json`,
          json: withFormatVersion(resolved.data, metadata.target)
        });
        break;
      case "loot_table":
        ir.behaviorPack.lootTables.push({
          path: `${pathName(resolved.path ?? `loot_tables/${declaration.name}`)}.json`,
          json: resolved.data
        });
        break;
      case "function":
        ir.behaviorPack.functions.push({
          path: `${pathName(resolved.path ?? declaration.name)}.mcfunction`,
          lines: resolved.body ?? []
        });
        break;
      case "animation":
        ir.resourcePack.animations.push({
          path: `animations/${pathName(resolved.path ?? declaration.name)}.json`,
          json: withFormatVersion(resolved.data, metadata.target)
        });
        break;
      case "animation_controller":
        ir.resourcePack.animationControllers.push({
          path: `animation_controllers/${pathName(resolved.path ?? declaration.name)}.json`,
          json: withFormatVersion(resolved.data, metadata.target)
        });
        break;
      case "spawn_rule":
        ir.behaviorPack.spawnRules.push({
          path: `spawn_rules/${pathName(resolved.path ?? declaration.name)}.json`,
          json: withFormatVersion(resolved.data, metadata.target)
        });
        break;
      case "locale":
        ir.resourcePack.localization.set(
          declaration.name,
          mergeLocaleEntries(ir.resourcePack.localization.get(declaration.name), resolved)
        );
        break;
      case "script_module":
        ir.behaviorPack.scripts.push({
          entry: resolved.entry,
          dependencies: resolved.dependencies ?? [],
          lines: resolved.body ?? []
        });
        break;
      default:
        break;
    }
  }

  return ir;
}

function buildItemIr(declaration, data, metadata) {
  if (isObject(data.data)) {
    return {
      path: `items/${pathName(data.path ?? declaration.name)}.json`,
      json: withFormatVersion(data.data, metadata.target)
    };
  }

  return {
    path: `items/${pathName(data.path ?? declaration.name)}.json`,
    json: {
      format_version: metadata.target,
      "minecraft:item": {
        description: {
          identifier: data.id
        },
        components: data.components ?? {}
      }
    }
  };
}

function buildBlockIr(declaration, data, metadata) {
  if (isObject(data.data)) {
    return {
      path: `blocks/${pathName(data.path ?? declaration.name)}.json`,
      json: withFormatVersion(data.data, metadata.target)
    };
  }

  return {
    path: `blocks/${pathName(data.path ?? declaration.name)}.json`,
    json: {
      format_version: metadata.target,
      "minecraft:block": {
        description: {
          identifier: data.id
        },
        components: data.components ?? {}
      }
    }
  };
}

function buildEntityIr(declaration, data, metadata) {
  if (isObject(data.server)) {
    return {
      path: `entities/${pathName(data.path ?? declaration.name)}.json`,
      json: withFormatVersion(data.server, metadata.target)
    };
  }

  if (isObject(data.data)) {
    return {
      path: `entities/${pathName(data.path ?? declaration.name)}.json`,
      json: withFormatVersion(data.data, metadata.target)
    };
  }

  return {
    path: `entities/${pathName(data.path ?? declaration.name)}.json`,
    json: {
      format_version: metadata.target,
      "minecraft:entity": {
        description: {
          identifier: data.id,
          is_spawnable: false,
          is_summonable: true
        },
        components: data.components ?? {}
      }
    }
  };
}

function buildClientEntityIr(declaration, data, metadata) {
  const json = isObject(data.client)
    ? withFormatVersion(data.client, metadata.target)
    : {
        format_version: metadata.target,
        "minecraft:client_entity": {
          description: {
            identifier: data.id,
            textures: data.texture ? { default: data.texture } : {}
          }
        }
      };

  return {
    path: `entity/${pathName(data.path ?? declaration.name)}.entity.json`,
    json
  };
}

function resolveReferences(value, model) {
  if (Array.isArray(value)) {
    return value.map((entry) => resolveReferences(entry, model));
  }

  if (isObject(value)) {
    if (value.kind === "ReferenceValue") {
      const target = model.lookup(value.targetKind, value.targetName);
      return resolveReferenceValue(target);
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, resolveReferences(entry, model)])
    );
  }

  return value;
}

function resolveReferenceValue(target) {
  if (!target) {
    return null;
  }

  switch (target.kind) {
    case "item":
    case "block":
    case "entity":
      return target.data.id ?? target.name;
    case "function":
    case "recipe":
    case "loot_table":
    case "animation":
    case "animation_controller":
    case "spawn_rule":
      return target.data.path ?? target.name;
    default:
      return target.name;
  }
}

function withFormatVersion(json, target) {
  if (!isObject(json)) {
    return { format_version: target };
  }

  if (json.format_version === undefined) {
    return {
      format_version: target,
      ...json
    };
  }

  return json;
}

function mergeLocaleEntries(current, next) {
  return {
    ...(current ?? {}),
    ...next
  };
}

function pathName(value) {
  return `${value}`.replace(/^\/+/, "").replace(/\\/g, "/");
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
