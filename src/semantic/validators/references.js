import { DiagnosticCode } from "../../diagnostics/codes.js";

export function validateReferences(model, diagnostics) {
  for (const declaration of model.declarations) {
    for (const reference of declaration.references) {
      const target = model.lookup(reference.targetKind, reference.targetName);

      if (target) {
        continue;
      }

      const sameNameKinds = model.declarations
        .filter((candidate) => candidate.name === reference.targetName)
        .map((candidate) => candidate.kind);
      const code =
        sameNameKinds.length > 0
          ? DiagnosticCode.WrongReferenceKind
          : DiagnosticCode.UnresolvedReference;
      const suffix =
        sameNameKinds.length > 0
          ? ` Available kinds for '${reference.targetName}': ${sameNameKinds.join(", ")}.`
          : "";

      diagnostics.add({
        code,
        message: `Unknown reference '@${reference.targetKind}.${reference.targetName}'.${suffix}`,
        sourceFile: declaration.sourceFile,
        span: reference.span
      });
    }
  }
}
