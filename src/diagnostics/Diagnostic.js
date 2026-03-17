export class Diagnostic {
  constructor({
    code,
    severity = "error",
    message,
    sourceFile = null,
    span = null,
    related = []
  }) {
    this.code = code;
    this.severity = severity;
    this.message = message;
    this.sourceFile = sourceFile;
    this.span = span;
    this.related = related;
  }
}
