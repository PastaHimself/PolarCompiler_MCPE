/* global importScripts, ts */

importScripts("./vendor/typescript.js");

const ROOT_LIB = "/__bedrock__/lib.esnext.slim.d.ts";
const SERVER_TYPES = "/__bedrock__/node_modules/@minecraft/server/index.d.ts";
const SERVER_UI_TYPES = "/__bedrock__/node_modules/@minecraft/server-ui/index.d.ts";

let typingsCache = null;

self.addEventListener("message", async (event) => {
  if (event.data?.type !== "analyze") {
    return;
  }

  try {
    const diagnostics = await analyzeWorkspace(event.data.workspace);
    self.postMessage({
      type: "result",
      id: event.data.id,
      diagnostics
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      id: event.data.id,
      message: error.message ?? "Script analysis failed."
    });
  }
});

async function analyzeWorkspace(workspace) {
  if (workspace?.modeInfo?.mode !== "packaged-addon") {
    return [];
  }

  const files = Array.isArray(workspace.files) ? workspace.files : [];
  const diagnostics = [];
  const manifests = collectBehaviorManifests(files);

  for (const manifest of manifests) {
    const fileMap = new Map(files.map((file) => [file.path, file]));
    const scriptModules = manifest.modules.filter((module) => module.type === "script");
    if (scriptModules.length === 0) {
      continue;
    }

    const declaredDependencies = extractDeclaredModuleDependencies(manifest.dependencies);

    for (const [scriptModuleIndex, module] of scriptModules.entries()) {
      if (typeof module.entry !== "string" || module.entry.length === 0) {
        diagnostics.push(createDiagnostic("error", "SCR1001", "Script module is missing its 'entry' field.", manifest.path));
        continue;
      }

      const entryPath = resolvePackPath(manifest.dir, module.entry);
      if (!belongsToPack(entryPath, manifest.dir)) {
        diagnostics.push(createDiagnostic("error", "SCR1002", `Script entry '${module.entry}' escapes the behavior pack root.`, manifest.path));
        continue;
      }

      const entryFile = fileMap.get(entryPath);
      if (!entryFile) {
        diagnostics.push(createDiagnostic("error", "SCR1003", `Script entry '${module.entry}' was not found.`, manifest.path));
        continue;
      }

      if (!isScriptFile(entryFile.ext)) {
        diagnostics.push(createDiagnostic("error", "SCR1004", `Script entry '${module.entry}' must be a .js, .mjs, or .cjs file.`, manifest.path));
        continue;
      }

      const moduleFiles = collectReachableScriptFiles(entryPath, fileMap, manifest.dir);
      const allowedDependencies = buildModuleDependencySet(declaredDependencies, scriptModuleIndex);

      for (const file of moduleFiles) {
        diagnostics.push(...analyzeImports(file, fileMap, manifest, allowedDependencies));
      }

      diagnostics.push(...runTypeCheck(moduleFiles, allowedDependencies));
    }
  }

  return dedupeDiagnostics(diagnostics).sort(compareDiagnostics);
}

function collectBehaviorManifests(files) {
  const manifests = [];

  for (const file of files) {
    if (!file.path.toLowerCase().endsWith("/manifest.json") && file.path.toLowerCase() !== "manifest.json") {
      continue;
    }

    let json;
    try {
      json = JSON.parse(file.content ?? "");
    } catch {
      continue;
    }

    const modules = Array.isArray(json.modules) ? json.modules.filter(isObject) : [];
    if (!modules.some((module) => module.type === "data" || module.type === "script")) {
      continue;
    }

    manifests.push({
      path: file.path,
      dir: dirname(file.path),
      modules,
      dependencies: Array.isArray(json.dependencies) ? json.dependencies : []
    });
  }

  return manifests;
}

function analyzeImports(file, fileMap, manifest, dependencies) {
  const diagnostics = [];
  const imports = extractImports(file.content ?? "");

  for (const imported of imports) {
    if (imported.specifier.startsWith("@minecraft/")) {
      if (!dependencies.has(imported.specifier)) {
        diagnostics.push(createDiagnostic("error", "SCR1101", `Missing manifest dependency for '${imported.specifier}'.`, file.path, imported.line, imported.column));
      }
      continue;
    }

    if (imported.specifier.startsWith(".")) {
      const resolved = resolveScriptImport(file.path, imported.specifier, fileMap);
      if (!resolved) {
        diagnostics.push(createDiagnostic("error", "SCR1102", `Could not resolve relative import '${imported.specifier}'.`, file.path, imported.line, imported.column));
      } else if (!belongsToPack(resolved, manifest.dir)) {
        diagnostics.push(createDiagnostic("error", "SCR1103", `Import '${imported.specifier}' resolves outside the behavior pack root.`, file.path, imported.line, imported.column));
      }
      continue;
    }

    diagnostics.push(createDiagnostic("warning", "SCR1104", `Bare import '${imported.specifier}' is not recognized as a Bedrock script module.`, file.path, imported.line, imported.column));
  }

  return diagnostics;
}

function runTypeCheck(scriptFiles, declaredDependencies = new Set()) {
  if (scriptFiles.length === 0) {
    return [];
  }

  const virtualFiles = new Map();
  for (const file of scriptFiles) {
    virtualFiles.set(normalizeVirtualPath(file.path), file.content ?? "");
  }

  const typings = getBundledTypings();
  virtualFiles.set(ROOT_LIB, typings.lib);
  if (declaredDependencies.has("@minecraft/server")) {
    virtualFiles.set(SERVER_TYPES, typings.server);
  }
  if (declaredDependencies.has("@minecraft/server-ui")) {
    virtualFiles.set(SERVER_UI_TYPES, typings.serverUi);
  }
  for (const [fileName, sourceText] of createDependencyShims(declaredDependencies)) {
    virtualFiles.set(fileName, sourceText);
  }

  const compilerOptions = {
    allowJs: true,
    checkJs: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    noEmit: true,
    noLib: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2020
  };

  const host = {
    fileExists: (fileName) => virtualFiles.has(normalizeVirtualPath(fileName)),
    readFile: (fileName) => virtualFiles.get(normalizeVirtualPath(fileName)),
    getSourceFile(fileName, languageVersion) {
      const normalized = normalizeVirtualPath(fileName);
      const sourceText = virtualFiles.get(normalized);
      if (sourceText === undefined) {
        return undefined;
      }
      return ts.createSourceFile(normalized, sourceText, languageVersion, true);
    },
    getDefaultLibFileName: () => ROOT_LIB,
    writeFile: () => {},
    getCurrentDirectory: () => "/",
    getDirectories: () => [],
    getCanonicalFileName: (fileName) => normalizeVirtualPath(fileName),
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    directoryExists: () => true,
    realpath: (fileName) => normalizeVirtualPath(fileName)
  };

  const rootNames = [
    ROOT_LIB,
    ...[SERVER_TYPES, SERVER_UI_TYPES].filter((fileName) => virtualFiles.has(fileName)),
    ...[...virtualFiles.keys()].filter((fileName) => fileName.endsWith("/index.d.ts") && fileName.startsWith("/__bedrock__/node_modules/")),
    ...scriptFiles.map((file) => normalizeVirtualPath(file.path))
  ];
  const scriptRootSet = new Set(scriptFiles.map((file) => normalizeVirtualPath(file.path)));
  const program = ts.createProgram(rootNames, compilerOptions, host);

  return ts.getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.file && scriptRootSet.has(normalizeVirtualPath(diagnostic.file.fileName)))
    .filter((diagnostic) => !shouldIgnoreTypeDiagnostic(diagnostic, declaredDependencies))
    .map((diagnostic) => convertTypeDiagnostic(diagnostic));
}

function convertTypeDiagnostic(diagnostic) {
  const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
  return {
    severity: "error",
    code: `SCR2${diagnostic.code}`,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    file: denormalizeVirtualPath(diagnostic.file.fileName),
    line: position.line + 1,
    column: position.character + 1
  };
}

function extractImports(source) {
  const results = [];
  const patterns = [
    /\bimport\s+(?:[^"'`]*?\s+from\s+)?["']([^"']+)["']/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) {
      const location = getLineAndColumn(source, match.index);
      results.push({
        specifier: match[1],
        line: location.line,
        column: location.column
      });
    }
  }

  return results;
}

function resolveScriptImport(fromPath, specifier, fileMap) {
  const baseDirectory = dirname(fromPath);
  const rawTarget = resolveRelativePath(baseDirectory, specifier);
  const candidates = [
    rawTarget,
    `${rawTarget}.js`,
    `${rawTarget}.mjs`,
    `${rawTarget}.cjs`,
    `${rawTarget}/index.js`,
    `${rawTarget}/index.mjs`,
    `${rawTarget}/index.cjs`
  ];

  return candidates.find((candidate) => fileMap.has(candidate)) ?? null;
}

function resolvePackPath(packDir, relativePath) {
  return resolveRelativePath(packDir || ".", relativePath);
}

function resolveRelativePath(basePath, relativePath) {
  const segments = basePath && basePath !== "." ? basePath.split("/") : [];
  for (const segment of `${relativePath}`.replace(/\\/g, "/").split("/")) {
    if (!segment || segment === ".") {
      continue;
    }
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}

function belongsToPack(filePath, packDir) {
  return !packDir || filePath === packDir || filePath.startsWith(`${packDir}/`);
}

function isScriptFile(extension) {
  return extension === ".js" || extension === ".mjs" || extension === ".cjs";
}

function dirname(filePath) {
  const normalized = `${filePath}`.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(0, index) : ".";
}

function normalizeVirtualPath(filePath) {
  return `/${`${filePath}`.replace(/\\/g, "/").replace(/^\/+/, "")}`;
}

function denormalizeVirtualPath(filePath) {
  return `${filePath}`.replace(/^\/+/, "");
}

function getLineAndColumn(text, offset) {
  const lines = text.slice(0, offset).split("\n");
  return {
    line: lines.length,
    column: lines.at(-1).length + 1
  };
}

function createDiagnostic(severity, code, message, file, line = 1, column = 1) {
  return { severity, code, message, file, line, column };
}

function compareDiagnostics(left, right) {
  const severityOrder = { error: 0, warning: 1, success: 2 };
  return (
    (severityOrder[left.severity] ?? 99) - (severityOrder[right.severity] ?? 99) ||
    `${left.file ?? ""}`.localeCompare(`${right.file ?? ""}`) ||
    (left.line ?? 1) - (right.line ?? 1) ||
    (left.column ?? 1) - (right.column ?? 1)
  );
}

function getBundledTypings() {
  if (!typingsCache) {
    typingsCache = {
      lib: readBundledTyping("lib.esnext.slim.d.ts"),
      server: readBundledTyping("minecraft-server.d.ts"),
      serverUi: readBundledTyping("minecraft-server-ui.d.ts")
    };
  }
  return typingsCache;
}

function readBundledTyping(fileName) {
  const request = new XMLHttpRequest();
  request.open("GET", `./typings/bedrock/${fileName}`, false);
  request.send();
  if (request.status < 200 || request.status >= 300) {
    throw new Error(`Could not load bundled Bedrock typing '${fileName}'.`);
  }
  return request.responseText;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractDeclaredModuleDependencies(dependencies) {
  return (Array.isArray(dependencies) ? dependencies : [])
    .filter((dependency) => isObject(dependency) && typeof dependency.module_name === "string")
    .map((dependency) => dependency.module_name);
}

function buildModuleDependencySet(declaredDependencies, moduleIndex) {
  const allowed = new Set(declaredDependencies);
  const slottedDependency = declaredDependencies[moduleIndex];
  if (typeof slottedDependency === "string") {
    allowed.add(slottedDependency);
  }
  return allowed;
}

function collectReachableScriptFiles(entryPath, fileMap, packDir) {
  const visited = new Set();
  const queue = [entryPath];
  const results = [];

  while (queue.length > 0) {
    const currentPath = queue.shift();
    if (!currentPath || visited.has(currentPath)) {
      continue;
    }
    visited.add(currentPath);

    const currentFile = fileMap.get(currentPath);
    if (!currentFile || !isScriptFile(currentFile.ext) || !belongsToPack(currentPath, packDir)) {
      continue;
    }

    results.push(currentFile);
    for (const imported of extractImports(currentFile.content ?? "")) {
      if (!imported.specifier.startsWith(".")) {
        continue;
      }
      const resolved = resolveScriptImport(currentFile.path, imported.specifier, fileMap);
      if (resolved && !visited.has(resolved)) {
        queue.push(resolved);
      }
    }
  }

  return results;
}

function createDependencyShims(declaredDependencies) {
  const shims = [];

  for (const moduleName of declaredDependencies) {
    if (!moduleName.startsWith("@minecraft/")) {
      continue;
    }
    if (moduleName === "@minecraft/server" || moduleName === "@minecraft/server-ui") {
      continue;
    }

    shims.push([
      `/__bedrock__/node_modules/${moduleName}/index.d.ts`,
      [
        `declare module "${moduleName}" {`,
        "  const defaultExport: any;",
        "  export default defaultExport;",
        "}"
      ].join("\n")
    ]);
  }

  return shims;
}

function dedupeDiagnostics(diagnostics) {
  const seen = new Set();
  return diagnostics.filter((diagnostic) => {
    const key = [
      diagnostic.severity,
      diagnostic.code,
      diagnostic.file,
      diagnostic.line,
      diagnostic.column,
      diagnostic.message
    ].join("|");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function shouldIgnoreTypeDiagnostic(diagnostic, declaredDependencies) {
  if (!diagnostic) {
    return false;
  }

  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  const referencedModule = [...declaredDependencies].find(
    (moduleName) => moduleName.startsWith("@minecraft/") && message.includes(`'${moduleName}'`)
  );

  if (!referencedModule) {
    return false;
  }

  if (referencedModule === "@minecraft/server" || referencedModule === "@minecraft/server-ui") {
    return false;
  }

  return diagnostic.code === 2305 || diagnostic.code === 2307 || diagnostic.code === 2614 || diagnostic.code === 2792;
}
