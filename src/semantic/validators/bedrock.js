import { DiagnosticCode } from "../../diagnostics/codes.js";

const namespacePattern = /^[a-z0-9_][a-z0-9_.-]*$/;
const identifierPattern = /^[a-z0-9_][a-z0-9_.-]*:[a-z0-9_][a-z0-9_./-]*$/;
const localePattern = /^[a-z]{2}_[A-Z]{2}$/;
const pathPattern = /^[a-zA-Z0-9_./-]+$/;

export function validateBedrockRules(model, diagnostics) {
  for (const declaration of model.declarations) {
    const { data } = declaration;

    switch (declaration.kind) {
      case "addon":
        requireStringField(declaration, "namespace", diagnostics);
        requireVersionField(declaration, "version", diagnostics);
        validatePatternField(
          declaration,
          "namespace",
          namespacePattern,
          DiagnosticCode.InvalidNamespace,
          "Addon namespace must contain lowercase letters, digits, underscores, dots, or hyphens.",
          diagnostics
        );
        if (data.min_engine_version !== undefined) {
          requireVersionField(declaration, "min_engine_version", diagnostics);
        }
        break;
      case "item":
      case "block":
      case "entity":
        requireStringField(declaration, "id", diagnostics);
        validatePatternField(
          declaration,
          "id",
          identifierPattern,
          DiagnosticCode.InvalidIdentifier,
          `${declaration.kind} ids must use the 'namespace:name' Bedrock identifier format.`,
          diagnostics
        );
        break;
      case "function":
        requireArrayOfStringsField(declaration, "body", diagnostics);
        validateOptionalPathField(declaration, "path", diagnostics);
        break;
      case "recipe":
      case "loot_table":
      case "animation":
      case "animation_controller":
      case "spawn_rule":
        if (!isObject(declaration.data.data)) {
          diagnostics.add({
            code: DiagnosticCode.MissingRequiredField,
            message: `${declaration.kind} declarations require a 'data' object.`,
            sourceFile: declaration.sourceFile,
            span: declaration.node.span
          });
        }
        validateOptionalPathField(declaration, "path", diagnostics);
        break;
      case "locale":
        if (!localePattern.test(declaration.name)) {
          diagnostics.add({
            code: DiagnosticCode.InvalidLocale,
            message: "Locale declaration names must look like 'en_US'.",
            sourceFile: declaration.sourceFile,
            span: declaration.node.span
          });
        }
        break;
      case "script_module":
        requireStringField(declaration, "entry", diagnostics);
        validateOptionalPathField(declaration, "entry", diagnostics);
        if (declaration.data.body !== undefined) {
          requireArrayOfStringsField(declaration, "body", diagnostics);
        }
        break;
      default:
        break;
    }
  }
}

function requireStringField(declaration, fieldName, diagnostics) {
  if (typeof declaration.data[fieldName] !== "string" || declaration.data[fieldName].length === 0) {
    diagnostics.add({
      code: DiagnosticCode.MissingRequiredField,
      message: `${declaration.kind} '${declaration.name}' requires a string field '${fieldName}'.`,
      sourceFile: declaration.sourceFile,
      span: declaration.node.span
    });
  }
}

function requireVersionField(declaration, fieldName, diagnostics) {
  const value = declaration.data[fieldName];
  if (!Array.isArray(value) || value.length !== 3 || value.some((part) => !Number.isInteger(part) || part < 0)) {
    diagnostics.add({
      code: DiagnosticCode.InvalidVersion,
      message: `${declaration.kind} '${declaration.name}' field '${fieldName}' must be an array of three non-negative integers.`,
      sourceFile: declaration.sourceFile,
      span: declaration.node.span
    });
  }
}

function requireArrayOfStringsField(declaration, fieldName, diagnostics) {
  const value = declaration.data[fieldName];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    diagnostics.add({
      code: DiagnosticCode.MissingRequiredField,
      message: `${declaration.kind} '${declaration.name}' requires '${fieldName}' to be an array of strings.`,
      sourceFile: declaration.sourceFile,
      span: declaration.node.span
    });
  }
}

function validatePatternField(declaration, fieldName, pattern, code, message, diagnostics) {
  const value = declaration.data[fieldName];
  if (typeof value === "string" && !pattern.test(value)) {
    diagnostics.add({
      code,
      message,
      sourceFile: declaration.sourceFile,
      span: declaration.node.span
    });
  }
}

function validateOptionalPathField(declaration, fieldName, diagnostics) {
  const value = declaration.data[fieldName];
  if (value !== undefined && (typeof value !== "string" || !pathPattern.test(value))) {
    diagnostics.add({
      code: DiagnosticCode.InvalidIdentifier,
      message: `${declaration.kind} '${declaration.name}' field '${fieldName}' must be a simple Bedrock path string.`,
      sourceFile: declaration.sourceFile,
      span: declaration.node.span
    });
  }
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
