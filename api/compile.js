import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { compileProject } from "../src/core/compileProject.js";

export default async function handler(req, res) {
  if (req.method === "GET") {
    res.status(200).json({
      ok: true,
      bridgeLabel: "Vercel API"
    });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({
      message: "Method not allowed."
    });
    return;
  }

  let tempRoot = null;
  const startedAt = Date.now();

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
    const files = normalizeFiles(body.files);
    const command = body.command === "validate" ? "validate" : "build";

    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bedrockc-vercel-"));
    await writeVirtualProject(tempRoot, files);

    const configPath = path.join(tempRoot, "bedrockc.config.json");
    const result = await compileProject({
      configPath,
      write: false
    });

    res.status(result.success ? 200 : 400).json({
      ok: result.success,
      bridgeLabel: "Vercel API",
      command,
      diagnostics: serializeDiagnostics(result.diagnostics ?? []),
      outputs: serializeOutputs(result.virtualFiles),
      durationMs: Date.now() - startedAt
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      bridgeLabel: "Vercel API",
      diagnostics: [
        {
          severity: "error",
          code: "API1000",
          message: error.message,
          file: "api/compile",
          line: 1,
          column: 1
        }
      ],
      outputs: [],
      durationMs: Date.now() - startedAt
    });
  } finally {
    if (tempRoot) {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  }
}

function normalizeFiles(files) {
  if (!files || typeof files !== "object" || Array.isArray(files)) {
    throw new Error("Request body must include a 'files' object.");
  }

  const normalizedEntries = Object.entries(files).map(([relativePath, content]) => {
    const safePath = sanitizePath(relativePath);
    if (typeof content !== "string") {
      throw new Error(`File '${relativePath}' must have string content.`);
    }
    return [safePath, content];
  });

  const normalized = Object.fromEntries(normalizedEntries);
  if (!normalized["bedrockc.config.json"]) {
    throw new Error("Request must include 'bedrockc.config.json'.");
  }
  if (!normalized["src/main.bca"]) {
    throw new Error("Request must include 'src/main.bca'.");
  }

  return normalized;
}

async function writeVirtualProject(rootDir, files) {
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(rootDir, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, content, "utf8");
  }
}

function serializeDiagnostics(diagnostics) {
  return diagnostics.map((diagnostic) => ({
    severity: diagnostic.severity ?? "error",
    code: diagnostic.code ?? "BCA0000",
    message: diagnostic.message,
    file: diagnostic.sourceFile?.path ? path.basename(diagnostic.sourceFile.path) : null,
    line: diagnostic.sourceFile && diagnostic.span
      ? diagnostic.sourceFile.getLineAndColumn(diagnostic.span.start).line
      : 1,
    column: diagnostic.sourceFile && diagnostic.span
      ? diagnostic.sourceFile.getLineAndColumn(diagnostic.span.start).column
      : 1
  }));
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

function sanitizePath(relativePath) {
  const normalized = `${relativePath}`.replace(/\\/g, "/").replace(/^\/+/, "");
  if (
    normalized.length === 0 ||
    normalized.startsWith("..") ||
    normalized.includes("/../") ||
    path.isAbsolute(normalized)
  ) {
    throw new Error(`Unsafe file path '${relativePath}'.`);
  }
  return normalized;
}
