export class TextSpan {
  constructor(start, length) {
    this.start = start;
    this.length = length;
  }

  get end() {
    return this.start + this.length;
  }

  static fromBounds(start, end) {
    return new TextSpan(start, Math.max(0, end - start));
  }
}
