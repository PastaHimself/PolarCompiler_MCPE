import fs from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const sourceDir = path.join(projectRoot, "web");
const outputDir = path.join(projectRoot, "public");

await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });
await fs.cp(sourceDir, outputDir, { recursive: true });

console.log(`Prepared Vercel static output in ${outputDir}`);
