import test from "node:test";
import assert from "node:assert/strict";
import { SourceFile } from "../src/diagnostics/SourceFile.js";
import { lexSource } from "../src/syntax/lexer.js";
import { TokenKind } from "../src/syntax/tokenKinds.js";

test("lexer tokenizes declarations and strings", () => {
  const sourceFile = new SourceFile("inline.bca", 'item ruby { id: "demo:ruby"; }');
  const { tokens, diagnostics } = lexSource(sourceFile);

  assert.equal(diagnostics.length, 0);
  assert.deepEqual(
    tokens.slice(0, 7).map((token) => token.kind),
    [
      TokenKind.Item,
      TokenKind.Identifier,
      TokenKind.LeftBrace,
      TokenKind.Identifier,
      TokenKind.Colon,
      TokenKind.String,
      TokenKind.Semicolon
    ]
  );
});
