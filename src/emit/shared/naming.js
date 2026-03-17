export function sanitizeFileName(value) {
  return `${value}`.replace(/[^A-Za-z0-9_./-]/g, "_");
}

export function localeToLangContent(entries) {
  return Object.keys(entries)
    .sort()
    .map((key) => `${key}=${entries[key]}`)
    .join("\n");
}
