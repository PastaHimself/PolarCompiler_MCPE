/* global importScripts, ts */

importScripts("./vendor/typescript.js");

const ROOT_LIB = "/__bedrock__/lib.esnext.slim.d.ts";
const BUNDLED_TYPE_MODULES = new Map([
  ["@minecraft/server", "/__bedrock__/node_modules/@minecraft/server/index.d.ts"],
  ["@minecraft/server-ui", "/__bedrock__/node_modules/@minecraft/server-ui/index.d.ts"]
]);
const SUPPORT_MODULE_SHIMS = new Map([
  ["@minecraft/common", `declare module "@minecraft/common";\n`],
  ["@minecraft/vanilla-data", `declare module "@minecraft/vanilla-data";\n`]
]);

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

  const files = Array.isArray(workspace.files)
    ? workspace.files.filter((file) => typeof file?.path === "string" && typeof file?.content === "string")
    : [];
  const fileMap = new Map(files.map((file) => [normalizeArchivePath(file.path), normalizeWorkspaceFile(file)]));
  const manifests = collectBehaviorScriptManifests(fileMap);
  const diagnostics = [];

  for (const manifest of manifests) {
    diagnostics.push(...analyzeManifestScripts(manifest, fileMap));
  }

  return dedupeDiagnostics(diagnostics).sort(compareDiagnostics);
}

function analyzeManifestScripts(manifest, fileMap) {
  const diagnostics = [];
  const dependencyNames = extractManifestDependencyNames(manifest.dependencies);
  const dependencySet = new Set(dependencyNames);

  for (const [scriptModuleIndex, scriptModule] of manifest.scriptModules.entries()) {
    const entryValue = typeof scriptModule.entry === "string" ? scriptModule.entry.trim() : "";
    if (!entryValue) {
      diagnostics.push(
        createDiagnostic("error", "SCR1001", "Script module is missing its 'entry' field.", manifest.path)
      );
      continue;
    }

    const entryPath = resolveRelativePath(manifest.dir, entryValue);
    if (!belongsToPack(entryPath, manifest.dir)) {
      diagnostics.push(
        createDiagnostic(
          "error",
          "SCR1002",
          `Script entry '${scriptModule.entry}' escapes the behavior pack root.`,
          manifest.path
        )
      );
      continue;
    }

    const entryFile = fileMap.get(entryPath);
    if (!entryFile) {
      diagnostics.push(
        createDiagnostic("error", "SCR1003", `Script entry '${scriptModule.entry}' was not found.`, manifest.path)
      );
      continue;
    }

    if (!isScriptFile(entryFile.ext)) {
      diagnostics.push(
        createDiagnostic(
          "error",
          "SCR1004",
          `Script entry '${scriptModule.entry}' must be a .js, .mjs, or .cjs file.`,
          manifest.path
        )
      );
      continue;
    }

    const graph = collectScriptGraph(entryFile, fileMap, manifest);
    diagnostics.push(...graph.diagnostics);

    const slotDependency = dependencyNames[scriptModuleIndex] ?? null;
    const allowedDependencies = buildAllowedDependencySet(dependencySet, slotDependency);
    const importedBedrockModules = collectImportedBedrockModules(graph.files);

    for (const importedModule of importedBedrockModules) {
      if (!allowedDependencies.has(importedModule)) {
        const consumer = findFirstImportConsumer(graph.files, importedModule);
        diagnostics.push(
          createDiagnostic(
            "error",
            "SCR1101",
            `Missing manifest dependency for '${importedModule}'.`,
            consumer?.file ?? manifest.path,
            consumer?.line ?? 1,
            consumer?.column ?? 1
          )
        );
      }
    }

    diagnostics.push(...collectSyntaxDiagnostics(graph.files));
    diagnostics.push(...runBedrockTypeCheck(graph.files, importedBedrockModules, allowedDependencies));
  }

  return diagnostics;
}

function collectBehaviorScriptManifests(fileMap) {
  const manifests = [];

  for (const file of fileMap.values()) {
    if (basename(file.path).toLowerCase() !== "manifest.json") {
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(file.content);
    } catch {
      continue;
    }

    const modules = Array.isArray(parsed.modules) ? parsed.modules.filter(isObject) : [];
    const hasBehaviorModule = modules.some((module) => module.type === "data");
    const scriptModules = modules.filter((module) => module.type === "script");
    if (!hasBehaviorModule || scriptModules.length === 0) {
      continue;
    }

    manifests.push({
      path: file.path,
      dir: dirname(file.path),
      scriptModules,
      dependencies: Array.isArray(parsed.dependencies) ? parsed.dependencies : []
    });
  }

  return manifests;
}

function collectScriptGraph(entryFile, fileMap, manifest) {
  const diagnostics = [];
  const visited = new Set();
  const queued = new Set([entryFile.path]);
  const queue = [entryFile.path];
  const files = [];

  while (queue.length > 0) {
    const currentPath = queue.shift();
    queued.delete(currentPath);
    if (!currentPath || visited.has(currentPath)) {
      continue;
    }
    visited.add(currentPath);

    const currentFile = fileMap.get(currentPath);
    if (!currentFile || !isScriptFile(currentFile.ext)) {
      continue;
    }

    const sourceFile = parseSourceFile(currentFile);
    const imports = collectImports(sourceFile);
    files.push({
      ...currentFile,
      sourceFile,
      imports
    });

    for (const imported of imports) {
      if (!imported.specifier.startsWith(".")) {
        continue;
      }

      const resolvedPath = resolveScriptImport(currentFile.path, imported.specifier, fileMap);
      if (!resolvedPath) {
        diagnostics.push(
          createDiagnostic(
            "error",
            "SCR1102",
            `Could not resolve relative import '${imported.specifier}'.`,
            currentFile.path,
            imported.line,
            imported.column
          )
        );
        continue;
      }

      if (!belongsToPack(resolvedPath, manifest.dir)) {
        diagnostics.push(
          createDiagnostic(
            "error",
            "SCR1103",
            `Import '${imported.specifier}' resolves outside the behavior pack root.`,
            currentFile.path,
            imported.line,
            imported.column
          )
        );
        continue;
      }

      const resolvedFile = fileMap.get(resolvedPath);
      if (!resolvedFile || !isScriptFile(resolvedFile.ext)) {
        diagnostics.push(
          createDiagnostic(
            "error",
            "SCR1105",
            `Import '${imported.specifier}' does not resolve to a Bedrock script file.`,
            currentFile.path,
            imported.line,
            imported.column
          )
        );
        continue;
      }

      if (!queued.has(resolvedPath) && !visited.has(resolvedPath)) {
        queue.push(resolvedPath);
        queued.add(resolvedPath);
      }
    }
  }

  return { files, diagnostics };
}

function collectImports(sourceFile) {
  const imports = [];

  visit(sourceFile);
  return imports;

  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push(createImportRecord(sourceFile, node.moduleSpecifier.text, node.moduleSpecifier));
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push(createImportRecord(sourceFile, node.moduleSpecifier.text, node.moduleSpecifier));
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const firstArgument = node.arguments[0];
        if (firstArgument && ts.isStringLiteral(firstArgument)) {
          imports.push(createImportRecord(sourceFile, firstArgument.text, firstArgument));
        }
      } else if (
        ts.isIdentifier(node.expression)
        && node.expression.text === "require"
        && node.arguments.length > 0
        && ts.isStringLiteral(node.arguments[0])
      ) {
        imports.push(createImportRecord(sourceFile, node.arguments[0].text, node.arguments[0]));
      }
    }

    ts.forEachChild(node, visit);
  }
}

function createImportRecord(sourceFile, specifier, node) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return {
    specifier,
    line: position.line + 1,
    column: position.character + 1
  };
}

function collectImportedBedrockModules(scriptFiles) {
  const modules = new Set();

  for (const file of scriptFiles) {
    for (const imported of file.imports) {
      if (imported.specifier.startsWith("@minecraft/")) {
        modules.add(imported.specifier);
      }
    }
  }

  return modules;
}

function findFirstImportConsumer(scriptFiles, specifier) {
  for (const file of scriptFiles) {
    const imported = file.imports.find((entry) => entry.specifier === specifier);
    if (imported) {
      return {
        file: file.path,
        line: imported.line,
        column: imported.column
      };
    }
  }

  return null;
}

function collectSyntaxDiagnostics(scriptFiles) {
  const diagnostics = [];

  for (const file of scriptFiles) {
    for (const diagnostic of file.sourceFile.parseDiagnostics ?? []) {
      diagnostics.push(convertTypeScriptDiagnostic(diagnostic, file.sourceFile, file.path, "SCR1200"));
    }

    for (const imported of file.imports) {
      if (!imported.specifier.startsWith(".") && !imported.specifier.startsWith("@minecraft/")) {
        diagnostics.push(
          createDiagnostic(
            "warning",
            "SCR1104",
            `Bare import '${imported.specifier}' is not recognized as a Bedrock script module.`,
            file.path,
            imported.line,
            imported.column
          )
        );
      }
    }
  }

  return diagnostics;
}

function runBedrockTypeCheck(scriptFiles, importedBedrockModules, allowedDependencies) {
  const typedModules = [...importedBedrockModules].filter((moduleName) => BUNDLED_TYPE_MODULES.has(moduleName));
  if (scriptFiles.length === 0 || typedModules.length === 0) {
    return [];
  }

  const virtualFiles = new Map();
  for (const file of scriptFiles) {
    virtualFiles.set(normalizeVirtualPath(file.path), file.content);
  }

  const typings = getBundledTypings();
  virtualFiles.set(ROOT_LIB, typings.lib);
  for (const [moduleName, sourceText] of SUPPORT_MODULE_SHIMS) {
    virtualFiles.set(`/__bedrock__/node_modules/${moduleName}/index.d.ts`, sourceText);
  }
  const typecheckDependencies = new Set([...allowedDependencies, ...importedBedrockModules]);
  for (const moduleName of typecheckDependencies) {
    if (!moduleName.startsWith("@minecraft/")) {
      continue;
    }

    const bundledPath = BUNDLED_TYPE_MODULES.get(moduleName);
    if (bundledPath) {
      virtualFiles.set(bundledPath, typings[moduleName]);
    } else {
      virtualFiles.set(`/__bedrock__/node_modules/${moduleName}/index.d.ts`, `declare module "${moduleName}";\n`);
    }
  }

  const compilerOptions = {
    allowJs: true,
    checkJs: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    noEmit: true,
    noLib: true,
    skipLibCheck: true,
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    target: ts.ScriptTarget.ES2020
  };

  const rootNames = [
    ROOT_LIB,
    ...[...virtualFiles.keys()].filter((fileName) => fileName.endsWith(".d.ts") && fileName !== ROOT_LIB),
    ...scriptFiles.map((file) => normalizeVirtualPath(file.path))
  ];
  const scriptRootSet = new Set(scriptFiles.map((file) => normalizeVirtualPath(file.path)));
  const directorySet = buildDirectorySet(virtualFiles.keys());

  const host = {
    fileExists(fileName) {
      return virtualFiles.has(normalizeVirtualPath(fileName));
    },
    readFile(fileName) {
      return virtualFiles.get(normalizeVirtualPath(fileName));
    },
    getSourceFile(fileName, languageVersion) {
      const normalized = normalizeVirtualPath(fileName);
      const sourceText = virtualFiles.get(normalized);
      if (sourceText === undefined) {
        return undefined;
      }
      return ts.createSourceFile(normalized, sourceText, languageVersion, true, inferScriptKind(normalized));
    },
    getDefaultLibFileName() {
      return ROOT_LIB;
    },
    writeFile() {},
    getCurrentDirectory() {
      return "/";
    },
    getDirectories(directoryName) {
      const normalizedDirectory = normalizeDirectoryPath(directoryName);
      const prefix = normalizedDirectory === "/" ? "/" : `${normalizedDirectory}/`;
      return [...directorySet]
        .filter((entry) => entry.startsWith(prefix))
        .map((entry) => entry.slice(prefix.length).split("/")[0])
        .filter(uniqueValue)
        .map((entry) => `${prefix}${entry}`);
    },
    getCanonicalFileName(fileName) {
      return normalizeVirtualPath(fileName);
    },
    useCaseSensitiveFileNames() {
      return true;
    },
    getNewLine() {
      return "\n";
    },
    directoryExists(directoryName) {
      return directorySet.has(normalizeDirectoryPath(directoryName));
    },
    realpath(fileName) {
      return normalizeVirtualPath(fileName);
    }
  };

  const program = ts.createProgram(rootNames, compilerOptions, host);

  return ts.getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.file && scriptRootSet.has(normalizeVirtualPath(diagnostic.file.fileName)))
    .filter((diagnostic) => !shouldIgnoreTypeDiagnostic(diagnostic))
    .map((diagnostic) =>
      convertTypeScriptDiagnostic(
        diagnostic,
        diagnostic.file,
        denormalizeVirtualPath(diagnostic.file.fileName),
        "SCR2"
      )
    );
}

function shouldIgnoreTypeDiagnostic(diagnostic) {
  if (!diagnostic) {
    return false;
  }

  return diagnostic.code === 2306;
}

function convertTypeScriptDiagnostic(diagnostic, sourceFile, archivePath, codePrefix) {
  const position = sourceFile.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
  return {
    severity: "error",
    code: `${codePrefix}${diagnostic.code}`,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    file: archivePath,
    line: position.line + 1,
    column: position.character + 1
  };
}

function normalizeWorkspaceFile(file) {
  const path = normalizeArchivePath(file.path);
  return {
    path,
    ext: extname(path),
    content: file.content ?? ""
  };
}

function extractManifestDependencyNames(dependencies) {
  return (Array.isArray(dependencies) ? dependencies : [])
    .filter((dependency) => isObject(dependency) && typeof dependency.module_name === "string")
    .map((dependency) => dependency.module_name.trim())
    .filter(Boolean);
}

function buildAllowedDependencySet(dependencySet, slotDependency) {
  const allowed = new Set(dependencySet);
  if (slotDependency) {
    allowed.add(slotDependency);
  }
  return allowed;
}

function parseSourceFile(file) {
  return ts.createSourceFile(
    normalizeVirtualPath(file.path),
    file.content,
    ts.ScriptTarget.Latest,
    true,
    inferScriptKind(file.path)
  );
}

function inferScriptKind(filePath) {
  if (filePath.endsWith(".cjs")) {
    return ts.ScriptKind.JS;
  }
  if (filePath.endsWith(".mjs")) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.JS;
}

function resolveScriptImport(fromPath, specifier, fileMap) {
  const rawTarget = resolveRelativePath(dirname(fromPath), specifier);
  const candidates = [
    rawTarget,
    `${rawTarget}.js`,
    `${rawTarget}.mjs`,
    `${rawTarget}.cjs`,
    `${rawTarget}/index.js`,
    `${rawTarget}/index.mjs`,
    `${rawTarget}/index.cjs`
  ];

  return candidates.find((candidate) => fileMap.has(normalizeArchivePath(candidate))) ?? null;
}

function resolveRelativePath(basePath, relativePath) {
  const segments = basePath && basePath !== "." ? normalizeArchivePath(basePath).split("/") : [];

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

  return normalizeArchivePath(segments.join("/"));
}

function buildDirectorySet(fileNames) {
  const directories = new Set(["/"]);

  for (const fileName of fileNames) {
    let current = parentVirtualDirectory(fileName);
    while (current) {
      if (directories.has(current)) {
        break;
      }
      directories.add(current);
      current = parentVirtualDirectory(current);
    }
  }

  return directories;
}

function parentVirtualDirectory(filePath) {
  const normalized = normalizeDirectoryPath(filePath);
  if (normalized === "/") {
    return "";
  }

  const slashIndex = normalized.lastIndexOf("/");
  return slashIndex <= 0 ? "/" : normalized.slice(0, slashIndex);
}

function belongsToPack(filePath, packDir) {
  if (!packDir || packDir === ".") {
    return true;
  }
  return filePath === packDir || filePath.startsWith(`${packDir}/`);
}

function isScriptFile(extension) {
  return extension === ".js" || extension === ".mjs" || extension === ".cjs";
}

function extname(filePath) {
  const normalized = normalizeArchivePath(filePath);
  const dotIndex = normalized.lastIndexOf(".");
  const slashIndex = normalized.lastIndexOf("/");
  return dotIndex > slashIndex ? normalized.slice(dotIndex).toLowerCase() : "";
}

function basename(filePath) {
  const normalized = normalizeArchivePath(filePath);
  const slashIndex = normalized.lastIndexOf("/");
  return slashIndex >= 0 ? normalized.slice(slashIndex + 1) : normalized;
}

function dirname(filePath) {
  const normalized = normalizeArchivePath(filePath);
  const slashIndex = normalized.lastIndexOf("/");
  return slashIndex >= 0 ? normalized.slice(0, slashIndex) : ".";
}

function normalizeArchivePath(filePath) {
  return `${filePath}`.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
}

function normalizeVirtualPath(filePath) {
  return `/${normalizeArchivePath(filePath)}`;
}

function denormalizeVirtualPath(filePath) {
  return normalizeArchivePath(`${filePath}`.replace(/^\/+/, ""));
}

function normalizeDirectoryPath(directoryName) {
  const normalized = normalizeVirtualPath(directoryName).replace(/\/+$/, "");
  return normalized || "/";
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

function createDiagnostic(severity, code, message, file, line = 1, column = 1) {
  return { severity, code, message, file, line, column };
}

function getBundledTypings() {
  if (!typingsCache) {
    typingsCache = {
      lib: readBundledTyping("lib.esnext.slim.d.ts"),
      "@minecraft/server": readBundledTyping("minecraft-server.d.ts"),
      "@minecraft/server-ui": readBundledTyping("minecraft-server-ui.d.ts")
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

function uniqueValue(value, index, values) {
  return values.indexOf(value) === index;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
