import { DiagnosticBag } from "../diagnostics/DiagnosticBag.js";
import { DiagnosticCode } from "../diagnostics/codes.js";
import { TextSpan } from "../diagnostics/TextSpan.js";
import { keywordKinds, TokenKind } from "./tokenKinds.js";

export function lexSource(sourceFile) {
  const bag = new DiagnosticBag();
  const tokens = [];
  let index = 0;

  while (index < sourceFile.text.length) {
    const start = index;
    const char = sourceFile.text[index];

    if (isWhitespace(char)) {
      index += 1;
      continue;
    }

    if (char === "/" && sourceFile.text[index + 1] === "/") {
      index = skipLineComment(sourceFile.text, index + 2);
      continue;
    }

    if (char === "/" && sourceFile.text[index + 1] === "*") {
      const end = sourceFile.text.indexOf("*/", index + 2);
      if (end === -1) {
        bag.add({
          code: DiagnosticCode.UnterminatedComment,
          message: "Unterminated block comment.",
          sourceFile,
          span: new TextSpan(start, sourceFile.text.length - start)
        });
        break;
      }

      index = end + 2;
      continue;
    }

    if (char === "\"") {
      const { value, end, terminated } = readStringLiteral(sourceFile.text, index);
      index = end;

      if (!terminated) {
        bag.add({
          code: DiagnosticCode.UnterminatedString,
          message: "Unterminated string literal.",
          sourceFile,
          span: new TextSpan(start, end - start)
        });
      }

      tokens.push(token(TokenKind.String, sourceFile.text.slice(start, end), value, start, end));
      continue;
    }

    if (isDigit(char)) {
      index = readNumber(sourceFile.text, index);
      const text = sourceFile.text.slice(start, index);
      tokens.push(token(TokenKind.Number, text, Number(text), start, index));
      continue;
    }

    if (isIdentifierStart(char)) {
      index = readIdentifier(sourceFile.text, index);
      const text = sourceFile.text.slice(start, index);
      const kind = keywordKinds.get(text) ?? TokenKind.Identifier;
      let value = text;
      if (kind === TokenKind.True) {
        value = true;
      } else if (kind === TokenKind.False) {
        value = false;
      }

      tokens.push(token(kind, text, value, start, index));
      continue;
    }

    const punctuation = punctuationKind(char);
    if (punctuation) {
      index += 1;
      tokens.push(token(punctuation, char, char, start, index));
      continue;
    }

    bag.add({
      code: DiagnosticCode.BadCharacter,
      message: `Unexpected character '${char}'.`,
      sourceFile,
      span: new TextSpan(start, 1)
    });
    index += 1;
  }

  tokens.push(token(TokenKind.EndOfFile, "", null, sourceFile.text.length, sourceFile.text.length));

  return { tokens, diagnostics: bag.diagnostics };
}

function token(kind, text, value, start, end) {
  return { kind, text, value, span: TextSpan.fromBounds(start, end) };
}

function skipLineComment(text, start) {
  let index = start;
  while (index < text.length && text[index] !== "\n") {
    index += 1;
  }
  return index;
}

function readStringLiteral(text, start) {
  let index = start + 1;
  let result = "";
  let terminated = false;

  while (index < text.length) {
    const char = text[index];
    if (char === "\"") {
      terminated = true;
      index += 1;
      break;
    }

    if (char === "\\") {
      const next = text[index + 1];
      if (next === "n") {
        result += "\n";
      } else if (next === "t") {
        result += "\t";
      } else if (next === "\"" || next === "\\") {
        result += next;
      } else {
        result += next ?? "";
      }
      index += 2;
      continue;
    }

    result += char;
    index += 1;
  }

  return { value: result, end: index, terminated };
}

function readNumber(text, start) {
  let index = start;
  while (index < text.length && isDigit(text[index])) {
    index += 1;
  }

  if (text[index] === ".") {
    index += 1;
    while (index < text.length && isDigit(text[index])) {
      index += 1;
    }
  }

  return index;
}

function readIdentifier(text, start) {
  let index = start;
  while (index < text.length && isIdentifierPart(text[index])) {
    index += 1;
  }
  return index;
}

function punctuationKind(char) {
  switch (char) {
    case "@":
      return TokenKind.At;
    case ".":
      return TokenKind.Dot;
    case ":":
      return TokenKind.Colon;
    case ";":
      return TokenKind.Semicolon;
    case ",":
      return TokenKind.Comma;
    case "{":
      return TokenKind.LeftBrace;
    case "}":
      return TokenKind.RightBrace;
    case "[":
      return TokenKind.LeftBracket;
    case "]":
      return TokenKind.RightBracket;
    default:
      return null;
  }
}

function isWhitespace(char) {
  return char === " " || char === "\t" || char === "\r" || char === "\n";
}

function isDigit(char) {
  return char >= "0" && char <= "9";
}

function isIdentifierStart(char) {
  return /[A-Za-z_]/.test(char);
}

function isIdentifierPart(char) {
  return /[A-Za-z0-9_-]/.test(char);
}
