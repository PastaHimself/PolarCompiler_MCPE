import crypto from "node:crypto";
import fs from "node:fs/promises";

export async function hashFile(filePath) {
  const content = await fs.readFile(filePath);
  return crypto.createHash("sha1").update(content).digest("hex");
}
