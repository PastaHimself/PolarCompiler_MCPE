import { TextSpan } from "../diagnostics/TextSpan.js";

export function createProgram(sourceFile, imports, declarations, span) {
  return { kind: "Program", sourceFile, imports, declarations, span };
}

export function createImportDeclaration(path, span) {
  return { kind: "ImportDeclaration", path, span };
}

export function createDeclaration(declarationKind, name, members, span) {
  return { kind: "Declaration", declarationKind, name, members, span };
}

export function createFieldMember(name, value, span) {
  return { kind: "FieldMember", name, value, span };
}

export function createBlockMember(name, members, span) {
  return { kind: "BlockMember", name, members, span };
}

export function createStringLiteral(value, span) {
  return { kind: "StringLiteral", value, span };
}

export function createNumberLiteral(value, span) {
  return { kind: "NumberLiteral", value, span };
}

export function createBooleanLiteral(value, span) {
  return { kind: "BooleanLiteral", value, span };
}

export function createArrayExpression(elements, span) {
  return { kind: "ArrayExpression", elements, span };
}

export function createObjectExpression(properties, span) {
  return { kind: "ObjectExpression", properties, span };
}

export function createObjectProperty(name, value, span) {
  return { kind: "ObjectProperty", name, value, span };
}

export function createReferenceExpression(targetKind, targetName, span) {
  return { kind: "ReferenceExpression", targetKind, targetName, span };
}

export function mergeSpans(startSpan, endSpan) {
  return TextSpan.fromBounds(startSpan.start, endSpan.end);
}
