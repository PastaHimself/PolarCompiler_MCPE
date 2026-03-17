import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { DiagnosticBag } from "../diagnostics/DiagnosticBag.js";
import { DiagnosticCode } from "../diagnostics/codes.js";
import { SourceFile } from "../diagnostics/SourceFile.js";
import { lexSource } from "../syntax/lexer.js";
import { parseTokens } from "../syntax/parser.js";

export async function buildProjectGraph(config, previousState = null) {
  const diagnostics = new DiagnosticBag();
  const modules = new Map();
  const moduleCache = new Map(previousState?.moduleCache ?? []);
  const visiting = new Set();
  const order = [];

  await visitModule(config.paths.entryPath, []);

  return {
    entryPath: config.paths.entryPath,
    modules,
    order,
    diagnostics: diagnostics.diagnostics,
    moduleCache
  };

  async function visitModule(modulePath, stack) {
    if (modules.has(modulePath)) {
      return;
    }

    if (visiting.has(modulePath)) {
      diagnostics.add({
        code: DiagnosticCode.ImportCycle,
        message: `Import cycle detected: ${[...stack, modulePath].join(" -> ")}`
      });
      return;
    }

    visiting.add(modulePath);

    let text;
    try {
      text = await fs.readFile(modulePath, "utf8");
    } catch (error) {
      diagnostics.add({
        code: DiagnosticCode.InvalidImportPath,
        message: `Could not read source file '${modulePath}': ${error.message}`
      });
      visiting.delete(modulePath);
      return;
    }

    const hash = hashText(text);
    let module = moduleCache.get(modulePath);

    if (!module || module.hash !== hash) {
      const sourceFile = new SourceFile(modulePath, text);
      const lexed = lexSource(sourceFile);
      const parsed = parseTokens(sourceFile, lexed.tokens);
      const resolvedImports = parsed.ast.imports.map((importNode) => ({
        node: importNode,
        resolvedPath: resolveImportPath(modulePath, importNode.path)
      }));

      module = {
        path: modulePath,
        sourceFile,
        hash,
        tokens: lexed.tokens,
        ast: parsed.ast,
        diagnostics: [...lexed.diagnostics, ...parsed.diagnostics],
        imports: resolvedImports
      };

      moduleCache.set(modulePath, module);
    }

    modules.set(modulePath, module);
    diagnostics.extend(module.diagnostics);

    for (const imported of module.imports) {
      if (!imported.resolvedPath) {
        diagnostics.add({
          code: DiagnosticCode.InvalidImportPath,
          message: `Invalid import path '${imported.node.path}'.`,
          sourceFile: module.sourceFile,
          span: imported.node.span
        });
        continue;
      }

      await visitModule(imported.resolvedPath, [...stack, modulePath]);
    }

    visiting.delete(modulePath);
    order.push(modulePath);
  }
}

function resolveImportPath(fromFile, specifier) {
  if (typeof specifier !== "string" || specifier.length === 0) {
    return null;
  }

  const withExtension = path.extname(specifier) ? specifier : `${specifier}.bca`;
  return path.resolve(path.dirname(fromFile), withExtension);
}

function hashText(text) {
  return crypto.createHash("sha1").update(text).digest("hex");
}
