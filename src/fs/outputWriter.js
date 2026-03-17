import fs from "node:fs/promises";
import path from "node:path";

export async function writeOutputPlan(outputPlan) {
  await fs.mkdir(outputPlan.rootDir, { recursive: true });
  const previousManifest = await readBuildInfo(outputPlan.buildInfoPath);
  const previousFiles = new Set(previousManifest.files ?? []);
  const nextFiles = new Set();
  let written = 0;

  for (const file of outputPlan.files) {
    nextFiles.add(file.relativePath);
    await fs.mkdir(path.dirname(file.absolutePath), { recursive: true });

    let existing = null;
    try {
      existing = await fs.readFile(file.absolutePath, "utf8");
    } catch {
      existing = null;
    }

    if (existing !== file.content) {
      await fs.writeFile(file.absolutePath, file.content, "utf8");
      written += 1;
    }
  }

  for (const relativePath of previousFiles) {
    if (!nextFiles.has(relativePath)) {
      const absolutePath = path.join(outputPlan.rootDir, relativePath);
      await fs.rm(absolutePath, { force: true });
    }
  }

  await fs.writeFile(
    outputPlan.buildInfoPath,
    JSON.stringify({ files: [...nextFiles].sort() }, null, 2),
    "utf8"
  );

  return {
    written,
    files: [...nextFiles].sort()
  };
}

async function readBuildInfo(buildInfoPath) {
  try {
    const text = await fs.readFile(buildInfoPath, "utf8");
    return JSON.parse(text);
  } catch {
    return { files: [] };
  }
}
