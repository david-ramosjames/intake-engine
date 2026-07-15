// Lightweight translation layer. Base text stays on the components (the default
// language); translations live in `definition.i18n[locale][key]`, keyed by a
// stable text key. This keeps existing definitions untouched and scales to any
// number of languages. The editor writes these keys; the runtime resolves them.

import type { JourneyDefinition } from "./schema";

export const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  es: "Español",
};

export const LANGUAGE_FLAGS: Record<string, string> = {
  en: "🇺🇸",
  es: "🇪🇸",
};

/** Stable text keys — must be identical in the editor and the runtime. */
export const tk = {
  label: (componentId: string) => `c:${componentId}:label`,
  content: (componentId: string) => `c:${componentId}:content`,
  line: (componentId: string, index: number) => `c:${componentId}:line:${index}`,
  help: (componentId: string) => `c:${componentId}:help`,
  option: (componentId: string, value: string) => `o:${componentId}:${value}`,
  cta: (pageId: string, index: number) => `cta:${pageId}:${index}`,
  ctaSubtitle: (pageId: string, index: number) => `cta:${pageId}:${index}:sub`,
  ctaNote: (pageId: string, index: number) => `cta:${pageId}:${index}:note`,
  continue: (pageId: string) => `p:${pageId}:continue`,
  continueSubtitle: (pageId: string) => `p:${pageId}:continue:sub`,
  bannerItem: (index: number) => `banner:item:${index}`,
};

/** Resolve a piece of text for a locale, falling back to the base value. */
export function localize(
  def: Pick<JourneyDefinition, "i18n">,
  locale: string | undefined,
  key: string,
  fallback: string | undefined,
): string {
  if (locale) {
    const v = def.i18n?.[locale]?.[key];
    if (typeof v === "string" && v.trim() !== "") return v;
  }
  return fallback ?? "";
}
