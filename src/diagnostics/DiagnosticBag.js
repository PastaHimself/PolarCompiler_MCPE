import { Diagnostic } from "./Diagnostic.js";

export class DiagnosticBag {
  constructor() {
    this.diagnostics = [];
  }

  add(diagnosticLike) {
    this.diagnostics.push(
      diagnosticLike instanceof Diagnostic ? diagnosticLike : new Diagnostic(diagnosticLike)
    );
  }

  extend(other) {
    for (const diagnostic of other ?? []) {
      this.add(diagnostic);
    }
  }

  hasErrors() {
    return this.diagnostics.some((diagnostic) => diagnostic.severity === "error");
  }
}
