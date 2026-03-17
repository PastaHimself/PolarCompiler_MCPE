import { formatDiagnostic } from "../diagnostics/format.js";

export function formatDiagnostics(diagnostics) {
  return diagnostics.map((diagnostic) => formatDiagnostic(diagnostic)).join("\n");
}
