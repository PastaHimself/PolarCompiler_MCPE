import fs from "node:fs/promises";
import path from "node:path";
import { DiagnosticBag } from "../diagnostics/DiagnosticBag.js";
import { DiagnosticCode } from "../diagnostics/codes.js";
import { normalizeConfig } from "./normalizeConfig.js";
import { validateConfigShape } from "./schema.js";

export async function loadConfig(configPath = "bedrockc.config.json") {
  const resolvedPath = path.resolve(configPath);
  const diagnostics = new DiagnosticBag();
  let rawText;

  try {
    rawText = await fs.readFile(resolvedPath, "utf8");
  } catch (error) {
    diagnostics.add({
      code: DiagnosticCode.InvalidConfig,
      message: `Could not read config file '${resolvedPath}': ${error.message}`
    });
    return { config: null, diagnostics: diagnostics.diagnostics };
  }

  let rawConfig;
  try {
    rawConfig = JSON.parse(rawText);
  } catch (error) {
    diagnostics.add({
      code: DiagnosticCode.InvalidConfig,
      message: `Invalid JSON in config file '${resolvedPath}': ${error.message}`
    });
    return { config: null, diagnostics: diagnostics.diagnostics };
  }

  diagnostics.extend(validateConfigShape(rawConfig));
  if (diagnostics.hasErrors()) {
    return { config: null, diagnostics: diagnostics.diagnostics };
  }

  return {
    config: normalizeConfig(rawConfig, resolvedPath),
    diagnostics: diagnostics.diagnostics
  };
}
