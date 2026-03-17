import { localeToLangContent } from "../shared/naming.js";
import { resourcePath } from "../shared/paths.js";

export function emitLocalization(ir, files) {
  const locales = [...ir.resourcePack.localization.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  );

  if (locales.length === 0) {
    return;
  }

  files.writeJson(
    resourcePath("texts/languages.json"),
    locales.map(([locale]) => locale)
  );

  for (const [locale, entries] of locales) {
    files.writeText(resourcePath(`texts/${locale}.lang`), localeToLangContent(entries));
  }
}
