import { DiagnosticBag } from "../diagnostics/DiagnosticBag.js";
import { DiagnosticCode } from "../diagnostics/codes.js";

export function validateConfigShape(rawConfig) {
  const diagnostics = new DiagnosticBag();

  if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
    diagnostics.add({
      code: DiagnosticCode.InvalidConfig,
      message: "Configuration root must be a JSON object."
    });
    return diagnostics.diagnostics;
  }

  if (!rawConfig.project || typeof rawConfig.project !== "object") {
    diagnostics.add({
      code: DiagnosticCode.InvalidConfig,
      message: "Configuration must include a 'project' object."
    });
    return diagnostics.diagnostics;
  }

  validateOptionalString(rawConfig.entry, "entry", diagnostics);
  validateOptionalString(rawConfig.srcDir, "srcDir", diagnostics);
  validateOptionalString(rawConfig.outDir, "outDir", diagnostics);
  validateRequiredString(rawConfig.project.slug, "project.slug", diagnostics);
  validateRequiredString(rawConfig.project.namespace, "project.namespace", diagnostics);
  validateVersionArray(rawConfig.project.version, "project.version", diagnostics);
  validateRequiredString(rawConfig.project.target, "project.target", diagnostics);

  if (rawConfig.project.minEngineVersion !== undefined) {
    validateVersionArray(rawConfig.project.minEngineVersion, "project.minEngineVersion", diagnostics);
  }

  if (rawConfig.packs !== undefined) {
    validatePack(rawConfig.packs.behavior, "packs.behavior", diagnostics);
    validatePack(rawConfig.packs.resource, "packs.resource", diagnostics);
  }

  if (rawConfig.scripts !== undefined) {
    if (typeof rawConfig.scripts !== "object" || Array.isArray(rawConfig.scripts) || rawConfig.scripts === null) {
      diagnostics.add({
        code: DiagnosticCode.InvalidConfig,
        message: "'scripts' must be an object."
      });
    } else {
      if (rawConfig.scripts.enabled !== undefined && typeof rawConfig.scripts.enabled !== "boolean") {
        diagnostics.add({
          code: DiagnosticCode.InvalidConfig,
          message: "'scripts.enabled' must be a boolean."
        });
      }

      if (rawConfig.scripts.modules !== undefined && !Array.isArray(rawConfig.scripts.modules)) {
        diagnostics.add({
          code: DiagnosticCode.InvalidConfig,
          message: "'scripts.modules' must be an array."
        });
      }
    }
  }

  return diagnostics.diagnostics;
}

function validatePack(pack, path, diagnostics) {
  if (pack === undefined) {
    return;
  }

  if (!pack || typeof pack !== "object" || Array.isArray(pack)) {
    diagnostics.add({
      code: DiagnosticCode.InvalidConfig,
      message: `'${path}' must be an object.`
    });
    return;
  }

  validateOptionalString(pack.name, `${path}.name`, diagnostics);
  validateOptionalString(pack.description, `${path}.description`, diagnostics);
  validateOptionalString(pack.headerUuid, `${path}.headerUuid`, diagnostics);
  validateOptionalString(pack.moduleUuid, `${path}.moduleUuid`, diagnostics);
}

function validateRequiredString(value, path, diagnostics) {
  if (typeof value !== "string" || value.length === 0) {
    diagnostics.add({
      code: DiagnosticCode.InvalidConfig,
      message: `'${path}' must be a non-empty string.`
    });
  }
}

function validateOptionalString(value, path, diagnostics) {
  if (value !== undefined && typeof value !== "string") {
    diagnostics.add({
      code: DiagnosticCode.InvalidConfig,
      message: `'${path}' must be a string.`
    });
  }
}

function validateVersionArray(value, path, diagnostics) {
  if (!Array.isArray(value) || value.length !== 3 || value.some((part) => !Number.isInteger(part) || part < 0)) {
    diagnostics.add({
      code: DiagnosticCode.InvalidConfig,
      message: `'${path}' must be an array of three non-negative integers.`
    });
  }
}
