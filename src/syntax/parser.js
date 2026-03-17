import { DiagnosticBag } from "../diagnostics/DiagnosticBag.js";
import { DiagnosticCode } from "../diagnostics/codes.js";
import { TextSpan } from "../diagnostics/TextSpan.js";
import {
  createArrayExpression,
  createBlockMember,
  createBooleanLiteral,
  createDeclaration,
  createFieldMember,
  createImportDeclaration,
  createNumberLiteral,
  createObjectExpression,
  createObjectProperty,
  createProgram,
  createReferenceExpression,
  createStringLiteral,
  mergeSpans
} from "./ast.js";
import { declarationTokenKinds, TokenKind } from "./tokenKinds.js";

const declarationKindMap = new Map([
  [TokenKind.Addon, "addon"],
  [TokenKind.Item, "item"],
  [TokenKind.Block, "block"],
  [TokenKind.Entity, "entity"],
  [TokenKind.Recipe, "recipe"],
  [TokenKind.LootTable, "loot_table"],
  [TokenKind.Function, "function"],
  [TokenKind.Animation, "animation"],
  [TokenKind.AnimationController, "animation_controller"],
  [TokenKind.SpawnRule, "spawn_rule"],
  [TokenKind.Locale, "locale"],
  [TokenKind.ScriptModule, "script_module"]
]);

export function parseTokens(sourceFile, tokens) {
  const parser = new Parser(sourceFile, tokens);
  return { ast: parser.parseProgram(), diagnostics: parser.diagnostics.diagnostics };
}

class Parser {
  constructor(sourceFile, tokens) {
    this.sourceFile = sourceFile;
    this.tokens = tokens;
    this.index = 0;
    this.diagnostics = new DiagnosticBag();
  }

  parseProgram() {
    const imports = [];
    const declarations = [];

    while (!this.is(TokenKind.EndOfFile)) {
      if (this.is(TokenKind.Import)) {
        imports.push(this.parseImportDeclaration());
        continue;
      }

      if (declarationTokenKinds.has(this.current().kind)) {
        declarations.push(this.parseDeclaration());
        continue;
      }

      this.reportUnexpectedToken("Expected an import or declaration.");
      this.synchronizeToStatementBoundary();
    }

    const endToken = this.current();
    const span = declarations.length
      ? mergeSpans(declarations[0].span, declarations[declarations.length - 1].span)
      : new TextSpan(0, endToken.span.end);

    return createProgram(this.sourceFile, imports, declarations, span);
  }

  parseImportDeclaration() {
    const start = this.consume(TokenKind.Import);
    const pathToken = this.expect(TokenKind.String, "Expected a string literal after 'import'.");
    const end = this.expect(TokenKind.Semicolon, "Expected ';' after import.");
    return createImportDeclaration(pathToken.value ?? "", mergeSpans(start.span, end.span));
  }

  parseDeclaration() {
    const keyword = this.advance();
    const declarationKind = declarationKindMap.get(keyword.kind);
    const nameToken = this.expect(TokenKind.Identifier, "Expected a declaration name.");
    this.expect(TokenKind.LeftBrace, "Expected '{' to start declaration body.");
    const members = this.parseBlockMembers();
    const closingBrace = this.expect(TokenKind.RightBrace, "Expected '}' to close declaration.");
    return createDeclaration(
      declarationKind,
      nameToken.value ?? "",
      members,
      mergeSpans(keyword.span, closingBrace.span)
    );
  }

  parseBlockMembers() {
    const members = [];

    while (!this.is(TokenKind.RightBrace) && !this.is(TokenKind.EndOfFile)) {
      if (!this.is(TokenKind.Identifier) && !this.is(TokenKind.String)) {
        this.reportUnexpectedToken("Expected a field or nested block member.");
        this.synchronizeToMemberBoundary();
        continue;
      }

      const key = this.advance();
      const memberName = key.value ?? key.text;

      if (this.is(TokenKind.LeftBrace)) {
        const openBrace = this.advance();
        const nestedMembers = this.parseBlockMembers();
        const closeBrace = this.expect(TokenKind.RightBrace, "Expected '}' to close nested block.");
        members.push(
          createBlockMember(memberName, nestedMembers, mergeSpans(key.span, closeBrace.span))
        );
        void openBrace;
        continue;
      }

      this.expect(TokenKind.Colon, "Expected ':' after member name.");
      const value = this.parseExpression();
      const end = this.expect(TokenKind.Semicolon, "Expected ';' after field value.");
      members.push(createFieldMember(memberName, value, mergeSpans(key.span, end.span)));
    }

    return members;
  }

  parseExpression() {
    const current = this.current();

    switch (current.kind) {
      case TokenKind.String:
        this.advance();
        return createStringLiteral(current.value, current.span);
      case TokenKind.Number:
        this.advance();
        return createNumberLiteral(current.value, current.span);
      case TokenKind.True:
      case TokenKind.False:
        this.advance();
        return createBooleanLiteral(Boolean(current.value), current.span);
      case TokenKind.LeftBracket:
        return this.parseArrayExpression();
      case TokenKind.LeftBrace:
        return this.parseObjectExpression();
      case TokenKind.At:
        return this.parseReferenceExpression();
      default:
        this.reportUnexpectedToken("Expected an expression.");
        this.advance();
        return createStringLiteral("", current.span);
    }
  }

  parseArrayExpression() {
    const open = this.consume(TokenKind.LeftBracket);
    const elements = [];

    while (!this.is(TokenKind.RightBracket) && !this.is(TokenKind.EndOfFile)) {
      elements.push(this.parseExpression());
      if (!this.is(TokenKind.Comma)) {
        break;
      }
      this.advance();
    }

    const close = this.expect(TokenKind.RightBracket, "Expected ']' to close array.");
    return createArrayExpression(elements, mergeSpans(open.span, close.span));
  }

  parseObjectExpression() {
    const open = this.consume(TokenKind.LeftBrace);
    const properties = [];

    while (!this.is(TokenKind.RightBrace) && !this.is(TokenKind.EndOfFile)) {
      if (!this.is(TokenKind.Identifier) && !this.is(TokenKind.String)) {
        this.reportUnexpectedToken("Expected an object property name.");
        this.synchronizeToObjectBoundary();
        continue;
      }

      const key = this.advance();
      const propertyName = key.value ?? key.text;
      this.expect(TokenKind.Colon, "Expected ':' after object property name.");
      const value = this.parseExpression();
      properties.push(createObjectProperty(propertyName, value, mergeSpans(key.span, value.span)));

      if (!this.is(TokenKind.Comma)) {
        break;
      }
      this.advance();
    }

    const close = this.expect(TokenKind.RightBrace, "Expected '}' to close object.");
    return createObjectExpression(properties, mergeSpans(open.span, close.span));
  }

  parseReferenceExpression() {
    const at = this.consume(TokenKind.At);
    const kind = this.expect(TokenKind.Identifier, "Expected a declaration kind after '@'.");
    this.expect(TokenKind.Dot, "Expected '.' after reference kind.");
    const name = this.expect(TokenKind.Identifier, "Expected a declaration name in reference.");
    return createReferenceExpression(kind.value ?? "", name.value ?? "", mergeSpans(at.span, name.span));
  }

  synchronizeToStatementBoundary() {
    while (!this.is(TokenKind.EndOfFile)) {
      if (this.is(TokenKind.Semicolon)) {
        this.advance();
        return;
      }
      if (this.is(TokenKind.Import) || declarationTokenKinds.has(this.current().kind)) {
        return;
      }
      this.advance();
    }
  }

  synchronizeToMemberBoundary() {
    while (!this.is(TokenKind.EndOfFile) && !this.is(TokenKind.RightBrace)) {
      if (this.is(TokenKind.Semicolon)) {
        this.advance();
        return;
      }
      if (this.is(TokenKind.Identifier) || this.is(TokenKind.String)) {
        return;
      }
      this.advance();
    }
  }

  synchronizeToObjectBoundary() {
    while (!this.is(TokenKind.EndOfFile) && !this.is(TokenKind.RightBrace)) {
      if (this.is(TokenKind.Comma)) {
        this.advance();
        return;
      }
      if (this.is(TokenKind.Identifier) || this.is(TokenKind.String)) {
        return;
      }
      this.advance();
    }
  }

  expect(kind, message) {
    if (this.is(kind)) {
      return this.advance();
    }

    this.diagnostics.add({
      code: DiagnosticCode.ExpectedToken,
      message,
      sourceFile: this.sourceFile,
      span: this.current().span
    });

    return {
      kind,
      text: "",
      value: null,
      span: new TextSpan(this.current().span.start, 0)
    };
  }

  consume(kind) {
    return this.expect(kind, `Expected token '${kind}'.`);
  }

  reportUnexpectedToken(message) {
    this.diagnostics.add({
      code: DiagnosticCode.UnexpectedToken,
      message,
      sourceFile: this.sourceFile,
      span: this.current().span
    });
  }

  is(kind) {
    return this.current().kind === kind;
  }

  current() {
    return this.tokens[this.index];
  }

  advance() {
    const token = this.tokens[this.index];
    if (this.index < this.tokens.length - 1) {
      this.index += 1;
    }
    return token;
  }
}
