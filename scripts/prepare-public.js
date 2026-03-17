import fs from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const sourceDir = path.join(projectRoot, "web");
const outputDir = path.join(projectRoot, "public");
const vendorDir = path.join(outputDir, "vendor");
const jszipSource = path.join(projectRoot, "node_modules", "jszip", "dist", "jszip.min.js");
const jszipTarget = path.join(vendorDir, "jszip.min.js");
const typescriptSource = path.join(projectRoot, "node_modules", "typescript", "lib", "typescript.js");
const typescriptTarget = path.join(vendorDir, "typescript.js");

await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });
await fs.cp(sourceDir, outputDir, { recursive: true });
await fs.mkdir(vendorDir, { recursive: true });
await fs.copyFile(jszipSource, jszipTarget);
await fs.copyFile(typescriptSource, typescriptTarget);

console.log(`Prepared Vercel static output in ${outputDir}`);
