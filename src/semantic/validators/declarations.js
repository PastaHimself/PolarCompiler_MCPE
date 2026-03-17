import { DiagnosticCode } from "../../diagnostics/codes.js";

export function validateDeclarations(model, diagnostics) {
  const addons = model.declarations.filter((declaration) => declaration.kind === "addon");

  if (addons.length === 0) {
    diagnostics.add({
      code: DiagnosticCode.MissingAddon,
      message: "Exactly one 'addon' declaration is required."
    });
  }

  if (addons.length > 1) {
    for (const addon of addons.slice(1)) {
      diagnostics.add({
        code: DiagnosticCode.MultipleAddons,
        message: "Only one 'addon' declaration is allowed.",
        sourceFile: addon.sourceFile,
        span: addon.node.span
      });
    }
  }
}
