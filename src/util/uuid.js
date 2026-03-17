import crypto from "node:crypto";

export function createDeterministicUuid(seed) {
  const hash = crypto.createHash("sha1").update(seed).digest("hex").slice(0, 32);
  const parts = [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    `${((parseInt(hash.slice(16, 17), 16) & 0x3) | 0x8).toString(16)}${hash.slice(17, 20)}`,
    hash.slice(20, 32)
  ];
  return parts.join("-");
}

export function createRandomUuid() {
  return crypto.randomUUID();
}
