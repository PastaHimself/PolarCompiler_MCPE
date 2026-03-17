import { DiagnosticBag } from "../diagnostics/DiagnosticBag.js";
import { DiagnosticCode } from "../diagnostics/codes.js";
import { bindProject } from "./binder.js";
import { validateBedrockRules } from "./validators/bedrock.js";
import { validateDeclarations } from "./validators/declarations.js";
import { validateManifestInputs } from "./validators/manifests.js";
import { validateReferences } from "./validators/references.js";

export function analyzeProject(graph, config) {
  const diagnostics = new DiagnosticBag();
  diagnostics.extend(graph.diagnostics);

  const binding = bindProject(graph);
  diagnostics.extend(binding.diagnostics);

  const declarations = binding.orderedSymbols.map((symbol) =>
    materializeDeclaration(symbol, graph, diagnostics)
  );

  const model = {
    config,
    graph,
    declarations,
    symbols: binding.symbols,
    byKind: binding.byKind,
    addon: declarations.find((declaration) => declaration.kind === "addon") ?? null,
    lookup(kind, name) {
      return binding.byKind.get(kind)?.get(name)?.semantic ?? null;
    }
  };

  for (const declaration of declarations) {
    const symbol = binding.byKind.get(declaration.kind)?.get(declaration.name);
    if (symbol) {
      symbol.semantic = declaration;
    }
  }

  validateDeclarations(model, diagnostics);
  validateReferences(model, diagnostics);
  validateBedrockRules(model, diagnostics);
  validateManifestInputs(model, diagnostics);

  return {
    ...model,
    diagnostics: diagnostics.diagnostics,
    hasErrors: diagnostics.hasErrors()
  };
}

function materializeDeclaration(symbol, graph, diagnostics) {
  const module = graph.modules.get(symbol.modulePath);
  const { value, references } = materializeMembers(symbol.node.members, module.sourceFile, diagnostics);

  return {
    kind: symbol.kind,
    name: symbol.name,
    sourceFile: symbol.sourceFile,
    modulePath: symbol.modulePath,
    node: symbol.node,
    data: value,
    references
  };
}

function materializeMembers(members, sourceFile, diagnostics) {
  const result = {};
  const references = [];
  const seen = new Map();

  for (const member of members) {
    const existing = seen.get(member.name);
    if (existing) {
      diagnostics.add({
        code: DiagnosticCode.DuplicateMember,
        message: `Duplicate member '${member.name}'.`,
        sourceFile,
        span: member.span,
        related: [
          {
            message: "Previous member is here.",
            sourceFile,
            span: existing.span
          }
        ]
      });
      continue;
    }

    seen.set(member.name, member);

    if (member.kind === "FieldMember") {
      const materialized = materializeValue(member.value, sourceFile, diagnostics);
      result[member.name] = materialized.value;
      references.push(...materialized.references);
      continue;
    }

    const nested = materializeMembers(member.members, sourceFile, diagnostics);
    result[member.name] = nested.value;
    references.push(...nested.references);
  }

  return { value: result, references };
}

function materializeValue(node, sourceFile, diagnostics) {
  switch (node.kind) {
    case "StringLiteral":
    case "NumberLiteral":
    case "BooleanLiteral":
      return { value: node.value, references: [] };
    case "ArrayExpression": {
      const array = [];
      const references = [];
      for (const element of node.elements) {
        const materialized = materializeValue(element, sourceFile, diagnostics);
        array.push(materialized.value);
        references.push(...materialized.references);
      }
      return { value: array, references };
    }
    case "ObjectExpression": {
      const object = {};
      const references = [];
      for (const property of node.properties) {
        const materialized = materializeValue(property.value, sourceFile, diagnostics);
        object[property.name] = materialized.value;
        references.push(...materialized.references);
      }
      return { value: object, references };
    }
    case "ReferenceExpression": {
      const reference = {
        kind: "ReferenceValue",
        targetKind: node.targetKind,
        targetName: node.targetName,
        span: node.span
      };
      return {
        value: reference,
        references: [reference]
      };
    }
    default:
      diagnostics.add({
        code: DiagnosticCode.UnexpectedToken,
        message: `Unsupported expression node '${node.kind}'.`,
        sourceFile,
        span: node.span
      });
      return { value: null, references: [] };
  }
}
