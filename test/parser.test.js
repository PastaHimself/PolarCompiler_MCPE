import test from "node:test";
import assert from "node:assert/strict";
import { SourceFile } from "../src/diagnostics/SourceFile.js";
import { lexSource } from "../src/syntax/lexer.js";
import { parseTokens } from "../src/syntax/parser.js";

test("parser builds a declaration AST", () => {
  const sourceFile = new SourceFile(
    "inline.bca",
    'addon hello { namespace: "demo"; version: [1, 0, 0]; }'
  );
  const { tokens } = lexSource(sourceFile);
  const { ast, diagnostics } = parseTokens(sourceFile, tokens);

  assert.equal(diagnostics.length, 0);
  assert.equal(ast.declarations.length, 1);
  assert.equal(ast.declarations[0].declarationKind, "addon");
  assert.equal(ast.declarations[0].name, "hello");
});
