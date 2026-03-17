export function formatDiagnostic(diagnostic) {
  if (!diagnostic.sourceFile || !diagnostic.span) {
    return `${diagnostic.severity.toUpperCase()} ${diagnostic.code}: ${diagnostic.message}`;
  }

  const { line, column } = diagnostic.sourceFile.getLineAndColumn(diagnostic.span.start);
  return `${diagnostic.sourceFile.path}:${line}:${column} ${diagnostic.severity.toUpperCase()} ${diagnostic.code}: ${diagnostic.message}`;
}
