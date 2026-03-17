export function visitNode(node, visitor) {
  if (!node) {
    return;
  }

  visitor(node);

  switch (node.kind) {
    case "Program":
      for (const child of node.imports) {
        visitNode(child, visitor);
      }
      for (const child of node.declarations) {
        visitNode(child, visitor);
      }
      break;
    case "Declaration":
    case "BlockMember":
      for (const child of node.members) {
        visitNode(child, visitor);
      }
      break;
    case "FieldMember":
      visitNode(node.value, visitor);
      break;
    case "ArrayExpression":
      for (const child of node.elements) {
        visitNode(child, visitor);
      }
      break;
    case "ObjectExpression":
      for (const child of node.properties) {
        visitNode(child, visitor);
      }
      break;
    case "ObjectProperty":
      visitNode(node.value, visitor);
      break;
    default:
      break;
  }
}
