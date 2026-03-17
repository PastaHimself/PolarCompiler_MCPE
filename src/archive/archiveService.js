import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import Busboy from "busboy";
import unzipper from "unzipper";
import Ajv from "ajv";
import { compileProject } from "../core/compileProject.js";
import {
  animationControllerSchema,
  animationSchema,
  blockSchema,
  clientEntitySchema,
  entitySchema,
  itemSchema,
  itemTextureSchema,
  manifestSchema,
  recipeSchema,
  spawnRuleSchema,
  terrainTextureSchema
} from "./schemas.js";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set([".json", ".mcfunction", ".lang", ".txt", ".bca", ".md"]);
const archiveKinds = new Set([".zip", ".mcaddon", ".mcpack"]);
const ajv = new Ajv({ allErrors: true, strict: false });

const validators = {
  manifest: ajv.compile(manifestSchema),
  behaviorItem: ajv.compile(itemSchema),
  behaviorBlock: ajv.compile(blockSchema),
  behaviorEntity: ajv.compile(entitySchema),
  resourceEntity: ajv.compile(clientEntitySchema),
  recipe: ajv.compile(recipeSchema),
  spawnRule: ajv.compile(spawnRuleSchema),
  animation: ajv.compile(animationSchema),
  animationController: ajv.compile(animationControllerSchema),
  itemTexture: ajv.compile(itemTextureSchema),
  terrainTexture: ajv.compile(terrainTextureSchema)
};

export async function handleArchiveRequest(req) {
  const startedAt = Date.now();
  const upload = await parseMultipartArchive(req);
  const archiveType = detectArchiveType(upload.filename);
  const extracted = await extractArchive(upload.buffer, archiveType);
  const detected = detectArchiveMode(extracted.files);

  if (detected.mode === "source-archive") {
    const result = await compileSourceArchive(extracted.files, detected.configPath);
    return {
      ok: result.success,
      bridgeLabel: "Vercel Archive API",
      mode: "source-archive",
      archiveType,
      summary: {
        filename: upload.filename,
        size: upload.buffer.length,
        detectedType: "bedrockc source project",
        configPath: detected.configPath,
        fileCount: extracted.files.length
      },
      diagnostics: serializeDiagnostics(result.diagnostics ?? []),
      files: serializeArchiveFiles(extracted.files),
      outputs: serializeOutputs(result.virtualFiles),
      durationMs: Date.now() - startedAt
    };
  }

  const packaged = validatePackagedArchive(extracted.files, archiveType, upload.filename);
  return {
    ok: !packaged.diagnostics.some((diagnostic) => diagnostic.severity === "error"),
    bridgeLabel: "Vercel Archive API",
    mode: "packaged-addon",
    archiveType,
    summary: {
      filename: upload.filename,
      size: upload.buffer.length,
      detectedType: packaged.summary.detectedType,
      packCount: packaged.summary.packCount,
      fileCount: extracted.files.length
    },
    diagnostics: packaged.diagnostics,
    files: serializeArchiveFiles(extracted.files),
    outputs: [],
    durationMs: Date.now() - startedAt
  };
}

export const archiveApiConfig = {
  api: {
    bodyParser: false
  }
};

function parseMultipartArchive(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({
      headers: req.headers,
      limits: {
        files: 1,
        fileSize: MAX_UPLOAD_BYTES
      }
    });

    let fileCount = 0;
    let resolved = false;
    let upload = null;

    busboy.on("file", (fieldName, file, info) => {
      if (fieldName !== "archive") {
        file.resume();
        return;
      }

      fileCount += 1;
      const chunks = [];

      file.on("data", (chunk) => {
        chunks.push(chunk);
      });

      file.on("limit", () => {
        reject(new Error("Archive exceeds the 20 MB upload limit."));
      });

      file.on("end", () => {
        upload = {
          filename: info.filename ?? "upload.zip",
          mimeType: info.mimeType ?? "application/octet-stream",
          buffer: Buffer.concat(chunks)
        };
      });
    });

    busboy.on("finish", () => {
      if (resolved) {
        return;
      }

      if (fileCount !== 1 || !upload) {
        reject(new Error("Exactly one file must be uploaded in the 'archive' field."));
        return;
      }

      resolved = true;
      resolve(upload);
    });

    busboy.on("error", reject);
    busboy.on("filesLimit", () => {
      reject(new Error("Only one archive file may be uploaded per request."));
    });
    req.pipe(busboy);
  });
}

export function detectArchiveType(filename) {
  const extension = path.extname(filename).toLowerCase();
  if (!archiveKinds.has(extension)) {
    throw new Error("Unsupported archive type. Use .mcaddon, .mcpack, or .zip.");
  }
  return extension.slice(1);
}

async function extractArchive(buffer) {
  let directory;
  try {
    directory = await unzipper.Open.buffer(buffer);
  } catch (error) {
    throw new Error(`Could not read archive: ${error.message}`);
  }

  const files = [];

  for (const entry of directory.files) {
    const type = entry.type ?? entry.props?.type;
    if (type === "Directory") {
      continue;
    }

    const relativePath = sanitizeRelativePath(entry.path);
    const contentBuffer = await entry.buffer();
    const previewable = isPreviewable(relativePath);

    files.push({
      path: relativePath,
      size: contentBuffer.length,
      ext: path.extname(relativePath).toLowerCase(),
      previewable,
      content: previewable ? contentBuffer.toString("utf8") : null,
      buffer: contentBuffer
    });
  }

  if (files.length === 0) {
    throw new Error("Archive is empty.");
  }

  return { files };
}

function sanitizeRelativePath(relativePath) {
  const normalized = `${relativePath}`.replace(/\\/g, "/").replace(/^\/+/, "");
  if (
    normalized.length === 0 ||
    normalized.startsWith("..") ||
    normalized.includes("/../") ||
    path.isAbsolute(normalized)
  ) {
    throw new Error(`Unsafe archive entry '${relativePath}'.`);
  }
  return normalized;
}

function isPreviewable(relativePath) {
  return TEXT_EXTENSIONS.has(path.extname(relativePath).toLowerCase()) ||
    path.basename(relativePath).toLowerCase() === "manifest.json";
}

export function detectArchiveMode(files) {
  const configFile = [...files]
    .map((file) => file.path)
    .filter((filePath) => path.basename(filePath).toLowerCase() === "bedrockc.config.json")
    .sort((left, right) => left.length - right.length)[0];
  const hasSourceFiles = files.some((file) => file.ext === ".bca");

  if (configFile && hasSourceFiles) {
    return {
      mode: "source-archive",
      configPath: configFile
    };
  }

  return {
    mode: "packaged-addon"
  };
}

async function compileSourceArchive(files, configPath) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bedrockc-archive-source-"));

  try {
    for (const file of files) {
      const absolutePath = path.join(tempRoot, file.path);
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, file.buffer);
    }

    return await compileProject({
      configPath: path.join(tempRoot, configPath),
      write: false
    });
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
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

    validateSchemaForClassification(classification, parsed, file.path, diagnostics);
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

function collectManifests(files, diagnostics) {
  const manifests = [];

  for (const file of files) {
    if (path.basename(file.path).toLowerCase() !== "manifest.json") {
      continue;
    }

    const parsed = safeParseJson(file, diagnostics);
    if (!parsed) {
      continue;
    }

    validateSchemaForClassification("manifest", parsed, file.path, diagnostics);
    manifests.push({
      path: file.path,
      dir: path.posix.dirname(file.path),
      json: parsed
    });
  }

  return manifests;
}

function classifyPacks(manifests) {
  return manifests.map((manifest) => {
    const moduleTypes = Array.isArray(manifest.json.modules)
      ? manifest.json.modules.map((module) => module.type)
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
      /\/(items|blocks|entities|recipes|loot_tables|functions|spawn_rules)\//.test(`/${file.path}`)
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

function safeParseJson(file, diagnostics) {
  try {
    return JSON.parse(file.content ?? file.buffer.toString("utf8"));
  } catch (error) {
    diagnostics.push(
      createDiagnostic("error", "ARC2101", `Invalid JSON: ${error.message}`, file.path)
    );
    return null;
  }
}

function classifyJsonFile(filePath, packs) {
  if (path.basename(filePath).toLowerCase() === "manifest.json") {
    return "manifest";
  }

  const normalized = filePath.replace(/\\/g, "/");
  const pack = packs.find((candidate) =>
    candidate.dir ? normalized.startsWith(`${candidate.dir}/`) : true
  );

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

  return null;
}

function validateSchemaForClassification(classification, json, filePath, diagnostics) {
  const validate = validators[classification];
  if (!validate) {
    return;
  }

  const valid = validate(json);
  if (valid) {
    return;
  }

  for (const error of validate.errors ?? []) {
    diagnostics.push(
      createDiagnostic(
        "error",
        "ARC2201",
        `${filePath} schema error at '${error.instancePath || "/"}': ${error.message}.`,
        filePath
      )
    );
  }
}

function validateCrossPackDependencies(packs, diagnostics) {
  const behavior = packs.find((pack) => pack.type === "behavior");
  const resource = packs.find((pack) => pack.type === "resource");

  if (resource && !behavior) {
    diagnostics.push(
      createDiagnostic(
        "warning",
        "ARC3003",
        "A resource pack was found without a behavior pack companion."
      )
    );
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

function serializeDiagnostics(diagnostics) {
  return diagnostics.map((diagnostic) => ({
    severity: diagnostic.severity ?? "error",
    code: diagnostic.code ?? "BCA0000",
    message: diagnostic.message,
    file: diagnostic.sourceFile?.path
      ? toRelativeDiagnosticPath(diagnostic.sourceFile.path)
      : diagnostic.file ?? null,
    line: diagnostic.sourceFile && diagnostic.span
      ? diagnostic.sourceFile.getLineAndColumn(diagnostic.span.start).line
      : diagnostic.line ?? 1,
    column: diagnostic.sourceFile && diagnostic.span
      ? diagnostic.sourceFile.getLineAndColumn(diagnostic.span.start).column
      : diagnostic.column ?? 1
  }));
}

function toRelativeDiagnosticPath(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  const marker = normalized.lastIndexOf("/src/");
  if (marker >= 0) {
    return normalized.slice(marker + 1);
  }
  return path.basename(normalized);
}

function serializeArchiveFiles(files) {
  return files
    .map((file) => ({
      path: file.path,
      kind: file.ext === ".json" ? "json" : "text",
      previewable: file.previewable,
      content: file.previewable ? file.content : null,
      size: file.size
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function serializeOutputs(virtualFiles) {
  if (!virtualFiles || typeof virtualFiles.entries !== "function") {
    return [];
  }

  return virtualFiles.entries().map(([relativePath, content]) => ({
    path: relativePath,
    kind: relativePath.endsWith(".json") ? "json" : "text",
    content
  }));
}
