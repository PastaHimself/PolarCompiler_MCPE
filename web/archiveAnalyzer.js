const TEXT_EXTENSIONS = new Set([".bca", ".cjs", ".js", ".json", ".lang", ".mcfunction", ".md", ".mjs", ".txt"]);
const ARCHIVE_TYPES = new Set(["zip", "mcaddon", "mcpack"]);

export async function inspectArchive(file) {
  const startedAt = performance.now();
  const archiveType = detectArchiveType(file?.name ?? "");
  let zip;
  try {
    zip = await getJsZip().loadAsync(file);
  } catch (error) {
    throw new Error(`Could not read archive: ${error.message}`);
  }
  const textDecoder = new TextDecoder();
  const files = [];

  for (const entry of Object.values(zip.files)) {
    if (entry.dir) {
      continue;
    }

    const relativePath = sanitizeRelativePath(entry.name);
    const buffer = await entry.async("uint8array");
    const ext = extname(relativePath);
    const previewable = isPreviewable(relativePath);

    files.push({
      path: relativePath,
      size: buffer.byteLength,
      ext,
      previewable,
      content: previewable ? textDecoder.decode(buffer) : null,
      buffer
    });
  }

  files.sort((left, right) => left.path.localeCompare(right.path));

  if (files.length === 0) {
    throw new Error("Archive is empty.");
  }

  return {
    archiveType,
    modeInfo: detectArchiveMode(files),
    files,
    durationMs: performance.now() - startedAt
  };
}

export function buildPackagedArchiveResult(file, inspection) {
  const packaged = validatePackagedArchive(inspection.files, inspection.archiveType);
  return {
    bridgeLabel: "Browser Archive Analyzer",
    mode: "packaged-addon",
    archiveType: inspection.archiveType,
    summary: {
      filename: file.name,
      size: file.size,
      detectedType: packaged.summary.detectedType,
      analysisRoute: "Browser packaged analysis",
      packCount: packaged.summary.packCount,
      fileCount: inspection.files.length
    },
    diagnostics: packaged.diagnostics,
    files: serializeArchiveFiles(inspection.files),
    outputs: [],
    durationMs: inspection.durationMs
  };
}

export function detectArchiveType(fileName) {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!ARCHIVE_TYPES.has(extension)) {
    throw new Error("Unsupported archive type. Use .mcaddon, .mcpack, or .zip.");
  }
  return extension;
}

export function detectArchiveMode(files) {
  const configPath = files
    .map((file) => file.path)
    .filter((filePath) => basename(filePath).toLowerCase() === "bedrockc.config.json")
    .sort((left, right) => left.length - right.length)[0];
  const hasSourceFiles = files.some((file) => file.ext === ".bca");

  if (configPath && hasSourceFiles) {
    return {
      mode: "source-archive",
      configPath
    };
  }

  return {
    mode: "packaged-addon",
    configPath: null
  };
}

export function validatePackagedArchive(files, archiveType) {
  const diagnostics = [];
  const manifests = collectManifests(files, diagnostics);
  const packs = classifyPacks(manifests);

  if (manifests.length === 0) {
    diagnostics.push(createDiagnostic("error", "ARC2001", "No manifest.json files were found in the archive."));
  }

  if (archiveType === "mcaddon" && packs.length < 2) {
    diagnostics.push(
      createDiagnostic(
        "warning",
        "ARC2002",
        "A .mcaddon usually contains both a behavior pack and a resource pack."
      )
    );
  }

  if (packs.length === 0) {
    diagnostics.push(
      createDiagnostic("error", "ARC2003", "Could not classify any pack as behavior or resource.")
    );
  }

  for (const pack of packs) {
    validatePackFiles(pack, files, diagnostics);
    validateTextFiles(pack, files, diagnostics);
  }

  for (const file of files) {
    if (file.ext !== ".json" || manifests.some((manifest) => manifest.path === file.path)) {
      continue;
    }

    const parsed = safeParseJson(file, diagnostics);
    if (!parsed) {
      continue;
    }

    const classification = classifyJsonFile(file.path, packs);
    if (!classification) {
      diagnostics.push(
        createDiagnostic(
          "warning",
          "ARC3201",
          `Schema validation is not implemented yet for '${file.path}'.`,
          file.path
        )
      );
      continue;
    }

    const errors = validateClassifiedJson(classification, parsed);
    for (const error of errors) {
      diagnostics.push(createDiagnostic("error", "ARC2201", `${file.path}: ${error}`, file.path));
    }
  }

  validateCrossPackDependencies(packs, diagnostics);

  return {
    summary: {
      detectedType: inferDetectedType(packs),
      packCount: packs.length
    },
    diagnostics
  };
}

function getJsZip() {
  const jszip = globalThis.JSZip;
  if (!jszip) {
    throw new Error("Archive analyzer runtime is unavailable. Reload the page and try again.");
  }
  return jszip;
}

function sanitizeRelativePath(relativePath) {
  const normalized = `${relativePath}`.replace(/\\/g, "/").replace(/^\/+/, "");
  if (
    normalized.length === 0 ||
    normalized.startsWith("..") ||
    normalized.includes("/../") ||
    normalized.includes("/./")
  ) {
    throw new Error(`Unsafe archive entry '${relativePath}'.`);
  }
  return normalized;
}

function isPreviewable(relativePath) {
  return TEXT_EXTENSIONS.has(extname(relativePath)) || basename(relativePath).toLowerCase() === "manifest.json";
}

function collectManifests(files, diagnostics) {
  const manifests = [];

  for (const file of files) {
    if (basename(file.path).toLowerCase() !== "manifest.json") {
      continue;
    }

    const parsed = safeParseJson(file, diagnostics);
    if (!parsed) {
      continue;
    }

    const errors = validateManifest(parsed);
    for (const error of errors) {
      diagnostics.push(createDiagnostic("error", "ARC2201", `${file.path}: ${error}`, file.path));
    }

    manifests.push({
      path: file.path,
      dir: dirname(file.path),
      json: parsed
    });
  }

  return manifests;
}

function classifyPacks(manifests) {
  return manifests.map((manifest) => {
    const moduleTypes = Array.isArray(manifest.json.modules)
      ? manifest.json.modules.map((module) => module?.type)
      : [];
    const type = moduleTypes.includes("data")
      ? "behavior"
      : moduleTypes.includes("resources")
        ? "resource"
        : "unknown";

    return {
      type,
      dir: manifest.dir === "." ? "" : manifest.dir,
      manifest
    };
  });
}

function validatePackFiles(pack, files, diagnostics) {
  const prefix = pack.dir ? `${pack.dir}/` : "";
  const packFiles = files.filter((file) => file.path === pack.manifest.path || file.path.startsWith(prefix));

  if (pack.type === "behavior") {
    const hasContent = packFiles.some((file) =>
      /\/(items|blocks|entities|recipes|loot_tables|functions|spawn_rules|scripts)\//.test(`/${file.path}`)
    );
    if (!hasContent) {
      diagnostics.push(
        createDiagnostic(
          "warning",
          "ARC3001",
          `Behavior pack '${pack.manifest.path}' contains no recognized behavior content folders.`,
          pack.manifest.path
        )
      );
    }
  }

  if (pack.type === "resource") {
    const hasContent = packFiles.some((file) =>
      /\/(entity|animations|animation_controllers|textures|texts)\//.test(`/${file.path}`)
    );
    if (!hasContent) {
      diagnostics.push(
        createDiagnostic(
          "warning",
          "ARC3002",
          `Resource pack '${pack.manifest.path}' contains no recognized resource content folders.`,
          pack.manifest.path
        )
      );
    }
  }
}

function validateTextFiles(pack, files, diagnostics) {
  if (pack.type !== "resource") {
    return;
  }

  const prefix = pack.dir ? `${pack.dir}/` : "";
  const resourceFiles = files.filter((file) => file.path === pack.manifest.path || file.path.startsWith(prefix));
  const languagesFile = resourceFiles.find((file) => /\/texts\/languages\.json$/i.test(`/${file.path}`));
  const langFiles = resourceFiles.filter((file) => /\/texts\/[^/]+\.lang$/i.test(`/${file.path}`));

  if (langFiles.length > 0 && !languagesFile) {
    diagnostics.push(
      createDiagnostic(
        "warning",
        "ARC3301",
        `Resource pack '${pack.manifest.path}' contains .lang files but is missing texts/languages.json.`,
        pack.manifest.path
      )
    );
  }

  for (const file of langFiles) {
    const lines = `${file.content ?? ""}`.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].trim();
      if (!line || line.startsWith("#")) {
        continue;
      }
      if (!line.includes("=")) {
        diagnostics.push(
          {
            severity: "warning",
            code: "ARC3303",
            message: `${file.path}: line ${index + 1} is not a key=value localization entry.`,
            file: file.path,
            line: index + 1,
            column: 1
          }
        );
      }
    }
  }
}

function safeParseJson(file, diagnostics) {
  try {
    return JSON.parse(file.content ?? "");
  } catch (error) {
    diagnostics.push(createDiagnostic("error", "ARC2101", `Invalid JSON: ${error.message}`, file.path));
    return null;
  }
}

function classifyJsonFile(filePath, packs) {
  const normalized = filePath.replace(/\\/g, "/");
  const pack = findOwningPack(normalized, packs);

  if (basename(normalized).toLowerCase() === "manifest.json") {
    return "manifest";
  }
  if (/\/items\/.+\.json$/i.test(normalized)) {
    return "behaviorItem";
  }
  if (/\/blocks\/.+\.json$/i.test(normalized)) {
    return pack?.type === "resource" ? null : "behaviorBlock";
  }
  if (/\/entities\/.+\.json$/i.test(normalized)) {
    return "behaviorEntity";
  }
  if (/\/entity\/.+\.json$/i.test(normalized)) {
    return "resourceEntity";
  }
  if (/\/recipes\/.+\.json$/i.test(normalized)) {
    return "recipe";
  }
  if (/\/loot_tables\/.+\.json$/i.test(normalized)) {
    return "lootTable";
  }
  if (/\/spawn_rules\/.+\.json$/i.test(normalized)) {
    return "spawnRule";
  }
  if (/\/animations\/.+\.json$/i.test(normalized)) {
    return "animation";
  }
  if (/\/animation_controllers\/.+\.json$/i.test(normalized)) {
    return "animationController";
  }
  if (/\/textures\/item_texture\.json$/i.test(normalized)) {
    return "itemTexture";
  }
  if (/\/textures\/terrain_texture\.json$/i.test(normalized)) {
    return "terrainTexture";
  }
  if (/\/texts\/languages\.json$/i.test(normalized)) {
    return "languages";
  }

  return null;
}

function findOwningPack(filePath, packs) {
  return [...packs]
    .sort((left, right) => right.dir.length - left.dir.length)
    .find((pack) => (pack.dir ? filePath.startsWith(`${pack.dir}/`) : true));
}

function validateClassifiedJson(classification, json) {
  switch (classification) {
    case "manifest":
      return validateManifest(json);
    case "behaviorItem":
      return validateItem(json);
    case "behaviorBlock":
      return validateBlock(json);
    case "behaviorEntity":
      return validateEntity(json, "minecraft:entity");
    case "resourceEntity":
      return validateEntity(json, "minecraft:client_entity");
    case "recipe":
    case "spawnRule":
    case "animation":
    case "animationController":
    case "lootTable":
      return validateFormatVersionDocument(json);
    case "itemTexture":
    case "terrainTexture":
      return validateTextureAtlas(json);
    case "languages":
      return Array.isArray(json) ? [] : ["languages.json must be an array of locale codes."];
    default:
      return [];
  }
}

function validateManifest(json) {
  const errors = [];
  if (!isObject(json)) {
    return ["Manifest must be a JSON object."];
  }

  requireKey(json, "format_version", errors, "Manifest is missing 'format_version'.");
  requireKey(json, "header", errors, "Manifest is missing 'header'.");
  requireKey(json, "modules", errors, "Manifest is missing 'modules'.");

  if (isObject(json.header)) {
    requireString(json.header, "name", errors, "Manifest header must include a string 'name'.");
    requireString(json.header, "description", errors, "Manifest header must include a string 'description'.");
    requireString(json.header, "uuid", errors, "Manifest header must include a string 'uuid'.");
    requireVersion(json.header, "version", errors, "Manifest header must include a version array.");
    if ("min_engine_version" in json.header) {
      requireVersion(
        json.header,
        "min_engine_version",
        errors,
        "Manifest header 'min_engine_version' must be a three-part integer array."
      );
    }
  } else if ("header" in json) {
    errors.push("Manifest 'header' must be an object.");
  }

  if (!Array.isArray(json.modules) || json.modules.length === 0) {
    errors.push("Manifest 'modules' must be a non-empty array.");
  } else {
    for (let index = 0; index < json.modules.length; index += 1) {
      const module = json.modules[index];
      if (!isObject(module)) {
        errors.push(`Manifest module ${index + 1} must be an object.`);
        continue;
      }
      requireString(module, "type", errors, `Manifest module ${index + 1} must include a string 'type'.`);
      requireString(module, "uuid", errors, `Manifest module ${index + 1} must include a string 'uuid'.`);
      if (!isValidVersion(module.version) && typeof module.version !== "string") {
        errors.push(`Manifest module ${index + 1} must include a string or three-part version value.`);
      }
    }
  }

  return errors;
}

function validateItem(json) {
  const errors = validateFormatVersionDocument(json);
  if (!isObject(json["minecraft:item"])) {
    errors.push("Item document must contain 'minecraft:item'.");
    return errors;
  }
  validateIdentifierContainer(json["minecraft:item"], errors, "Item");
  return errors;
}

function validateBlock(json) {
  const errors = validateFormatVersionDocument(json);
  if (!isObject(json["minecraft:block"])) {
    errors.push("Block document must contain 'minecraft:block'.");
    return errors;
  }
  validateIdentifierContainer(json["minecraft:block"], errors, "Block");
  return errors;
}

function validateEntity(json, key) {
  const errors = validateFormatVersionDocument(json);
  if (!isObject(json[key])) {
    errors.push(`Entity document must contain '${key}'.`);
  }
  return errors;
}

function validateIdentifierContainer(container, errors, label) {
  if (!isObject(container.description)) {
    errors.push(`${label} description must be an object.`);
    return;
  }
  requireString(container.description, "identifier", errors, `${label} description must include a string 'identifier'.`);
}

function validateFormatVersionDocument(json) {
  if (!isObject(json)) {
    return ["Document must be a JSON object."];
  }
  return Object.prototype.hasOwnProperty.call(json, "format_version")
    ? []
    : ["Document must include 'format_version'."];
}

function validateTextureAtlas(json) {
  const errors = [];
  if (!isObject(json)) {
    return ["Texture atlas must be a JSON object."];
  }
  requireString(json, "texture_name", errors, "Texture atlas must include a string 'texture_name'.");
  if (!isObject(json.texture_data)) {
    errors.push("Texture atlas must include an object 'texture_data'.");
  }
  return errors;
}

function validateCrossPackDependencies(packs, diagnostics) {
  const behavior = packs.find((pack) => pack.type === "behavior");
  const resource = packs.find((pack) => pack.type === "resource");

  if (resource && !behavior) {
    diagnostics.push(
      createDiagnostic("warning", "ARC3003", "A resource pack was found without a behavior pack companion.")
    );
    return;
  }

  if (resource && behavior) {
    const dependencies = Array.isArray(resource.manifest.json.dependencies)
      ? resource.manifest.json.dependencies
      : [];
    const behaviorHeaderUuid = behavior.manifest.json?.header?.uuid;
    if (
      behaviorHeaderUuid &&
      !dependencies.some((dependency) => isObject(dependency) && dependency.uuid === behaviorHeaderUuid)
    ) {
      diagnostics.push(
        createDiagnostic(
          "warning",
          "ARC3004",
          `Resource pack '${resource.manifest.path}' does not declare a dependency on behavior pack '${behavior.manifest.path}'.`,
          resource.manifest.path
        )
      );
    }
  }
}

function inferDetectedType(packs) {
  if (packs.some((pack) => pack.type === "behavior") && packs.some((pack) => pack.type === "resource")) {
    return "packaged Bedrock add-on";
  }
  if (packs.some((pack) => pack.type === "behavior") || packs.some((pack) => pack.type === "resource")) {
    return "single pack";
  }
  return "unsupported archive layout";
}

function serializeArchiveFiles(files) {
  return files.map((file) => ({
    path: file.path,
    kind: file.ext === ".json" ? "json" : "text",
    previewable: file.previewable,
    content: file.previewable ? file.content ?? "" : null,
    size: file.size
  }));
}

function createDiagnostic(severity, code, message, file = null) {
  return {
    severity,
    code,
    message,
    file,
    line: 1,
    column: 1
  };
}

function requireKey(value, key, errors, message) {
  if (!Object.prototype.hasOwnProperty.call(value, key)) {
    errors.push(message);
  }
}

function requireString(value, key, errors, message) {
  if (typeof value[key] !== "string" || value[key].length === 0) {
    errors.push(message);
  }
}

function requireVersion(value, key, errors, message) {
  if (!isValidVersion(value[key])) {
    errors.push(message);
  }
}

function isValidVersion(value) {
  return Array.isArray(value) && value.length >= 3 && value.every((entry) => Number.isInteger(entry));
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function basename(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(index + 1) : normalized;
}

function dirname(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(0, index) : ".";
}

function extname(filePath) {
  const base = basename(filePath);
  const index = base.lastIndexOf(".");
  return index >= 0 ? base.slice(index).toLowerCase() : "";
}
