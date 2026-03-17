import { DiagnosticCode } from "../../diagnostics/codes.js";

export function validateManifestInputs(model, diagnostics) {
  const scriptDeclarations = model.declarations.filter(
    (declaration) => declaration.kind === "script_module"
  );

  if (!model.config.scripts.enabled && scriptDeclarations.length > 0) {
    for (const declaration of scriptDeclarations) {
      diagnostics.add({
        code: DiagnosticCode.MissingRequiredField,
        message: "script_module declarations require 'scripts.enabled' to be true in config.",
        sourceFile: declaration.sourceFile,
        span: declaration.node.span
      });
    }
  }
}
