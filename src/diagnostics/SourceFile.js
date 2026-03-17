export class SourceFile {
  constructor(path, text) {
    this.path = path;
    this.text = text;
    this.lineStarts = computeLineStarts(text);
  }

  getLineAndColumn(offset) {
    let low = 0;
    let high = this.lineStarts.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const lineStart = this.lineStarts[mid];
      const nextLineStart = this.lineStarts[mid + 1] ?? Number.MAX_SAFE_INTEGER;

      if (offset < lineStart) {
        high = mid - 1;
      } else if (offset >= nextLineStart) {
        low = mid + 1;
      } else {
        return { line: mid + 1, column: offset - lineStart + 1 };
      }
    }

    return { line: 1, column: 1 };
  }
}

function computeLineStarts(text) {
  const lineStarts = [0];

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      lineStarts.push(index + 1);
    }
  }

  return lineStarts;
}
