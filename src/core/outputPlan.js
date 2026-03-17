import path from "node:path";

export function createOutputPlan(config, virtualFiles) {
  const files = virtualFiles.entries().map(([relativePath, content]) => ({
    relativePath,
    absolutePath: path.join(config.paths.outDir, relativePath),
    content
  }));

  return {
    rootDir: config.paths.outDir,
    buildInfoPath: config.paths.buildInfoPath,
    files
  };
}
