export const declarationKinds = [
  "addon",
  "item",
  "block",
  "entity",
  "recipe",
  "loot_table",
  "function",
  "animation",
  "animation_controller",
  "spawn_rule",
  "locale",
  "script_module"
];

export function symbolKey(kind, name) {
  return `${kind}:${name}`;
}

export function createSymbol(module, declaration) {
  return {
    key: symbolKey(declaration.declarationKind, declaration.name),
    kind: declaration.declarationKind,
    name: declaration.name,
    modulePath: module.path,
    sourceFile: module.sourceFile,
    node: declaration
  };
}
