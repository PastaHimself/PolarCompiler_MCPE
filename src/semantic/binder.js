import { DiagnosticBag } from "../diagnostics/DiagnosticBag.js";
import { DiagnosticCode } from "../diagnostics/codes.js";
import { createSymbol, declarationKinds, symbolKey } from "./symbols.js";

export function bindProject(graph) {
  const diagnostics = new DiagnosticBag();
  const symbols = new Map();
  const byKind = new Map(declarationKinds.map((kind) => [kind, new Map()]));
  const orderedSymbols = [];

  for (const modulePath of graph.order) {
    const module = graph.modules.get(modulePath);

    for (const declaration of module.ast.declarations) {
      const symbol = createSymbol(module, declaration);
      const key = symbolKey(symbol.kind, symbol.name);
      const existing = symbols.get(key);

      if (existing) {
        diagnostics.add({
          code: DiagnosticCode.DuplicateDeclaration,
          message: `Duplicate ${symbol.kind} declaration '${symbol.name}'.`,
          sourceFile: symbol.sourceFile,
          span: symbol.node.span,
          related: [
            {
              message: "Previous declaration is here.",
              sourceFile: existing.sourceFile,
              span: existing.node.span
            }
          ]
        });
        continue;
      }

      symbols.set(key, symbol);
      byKind.get(symbol.kind).set(symbol.name, symbol);
      orderedSymbols.push(symbol);
    }
  }

  return {
    diagnostics: diagnostics.diagnostics,
    symbols,
    byKind,
    orderedSymbols
  };
}
