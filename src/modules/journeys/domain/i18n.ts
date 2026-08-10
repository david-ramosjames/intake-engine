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
  help: (componentId: string) => `c:${componentId}:help`,
  option: (componentId: string, value: string) => `o:${componentId}:${value}`,
  cta: (pageId: string, index: number) => `cta:${pageId}:${index}`,
  ctaSubtitle: (pageId: string, index: number) => `cta:${pageId}:${index}:sub`,
  ctaNote: (pageId: string, index: number) => `cta:${pageId}:${index}:note`,
  continue: (pageId: string) => `p:${pageId}:continue`,
  continueSubtitle: (pageId: string) => `p:${pageId}:continue:sub`,
  bannerItem: (index: number) => `banner:item:${index}`,
  // Desktop callback card (theme-level text).
  callbackHeading: () => `callback:heading`,
  callbackButton: () => `callback:button`,
  callbackButtonSub: () => `callback:button:sub`,
  callbackSecure: () => `callback:secure`,
  // Side-image overlay (theme-level text over the photo).
  overlayTitle: () => `overlay:title`,
  overlaySubtitle: () => `overlay:subtitle`,
  overlayMessage: () => `overlay:message`,
  overlayBullet: (index: number) => `overlay:bullet:${index}`,
  // Below-the-fold optional sections (theme-level).
  faqHeading: () => `faq:heading`,
  faqQuestion: (index: number) => `faq:${index}:q`,
  faqAnswer: (index: number) => `faq:${index}:a`,
  faqDisclaimer: () => `faq:disclaimer`,
  reviewsHeading: () => `reviews:heading`,
  reviewText: (index: number) => `reviews:${index}:text`,
};

/**
 * Resolve a starting locale from a URL value (e.g. ?lang=es on a Spanish ad's
 * final URL). Normalizes region tags ("es-MX" → "es") and only returns a locale
 * the journey actually offers; otherwise undefined (caller uses the default).
 */
export function localeFromParam(value: string | undefined, languages: string[]): string | undefined {
  if (!value) return undefined;
  const norm = value.trim().toLowerCase().split(/[-_]/)[0];
  return languages.find((l) => l.toLowerCase() === norm);
}

/**
 * Resolve a starting locale from the browser's Accept-Language header — used as a
 * fallback when no ?lang param is present, so a Spanish-preferring browser opens
 * the journey in Spanish. Returns undefined when none of the browser's languages
 * are offered (caller uses the journey default).
 */
export function localeFromAcceptLanguage(
  header: string | null | undefined,
  languages: string[],
): string | undefined {
  if (!header) return undefined;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      const weight = q ? Number.parseFloat(q.split("=")[1] ?? "1") : 1;
      return { base: (tag ?? "").trim().toLowerCase().split(/[-_]/)[0], weight: Number.isNaN(weight) ? 1 : weight };
    })
    .filter((x) => x.base)
    .sort((a, b) => b.weight - a.weight);
  for (const { base } of ranked) {
    const match = languages.find((l) => l.toLowerCase() === base);
    if (match) return match;
  }
  return undefined;
}

/**
 * The effective starting locale: an explicit ?lang/hl/locale param wins, then the
 * browser's Accept-Language, then the journey's default (first language, or "en").
 * Used by both the runtime render and generateMetadata so the two agree.
 */
export function pickLocale(
  param: string | undefined,
  acceptLanguage: string | null | undefined,
  languages: string[],
): string {
  return (
    localeFromParam(param, languages) ??
    localeFromAcceptLanguage(acceptLanguage, languages) ??
    languages[0] ??
    "en"
  );
}

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
