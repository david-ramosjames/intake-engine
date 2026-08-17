// One "business phone number" per org, set in Settings. When present it's
// applied to every journey's call/text buttons and top bar at render time, so
// the number shown (and dialed) is identical everywhere — which is what CallRail's
// swap.js needs to find and swap it for a tracking number. Set it once instead
// of hunting through each journey.

import { telDigits, type JourneyDefinition } from "@/modules/journeys/domain/schema";

/** The org's master phone number (display form, e.g. "(512) 537-3369"), or "". */
export function readBusinessPhone(settings: Record<string, unknown> | undefined): string {
  const v = settings?.phone;
  return typeof v === "string" ? v.trim() : "";
}

function isCallish(cta: { type?: string; href?: string }): boolean {
  return (
    cta.type === "call" ||
    cta.type === "text" ||
    (typeof cta.href === "string" && (cta.href.startsWith("tel:") || cta.href.startsWith("sms:")))
  );
}

/**
 * Return a copy of the definition with the org's phone number applied to the
 * top-bar call button and every call/text CTA — so all journeys stay in sync
 * with the CallRail swap target. Done immutably (never mutate the cached def).
 * Only replaces numbers that already exist; it won't add call buttons.
 */
export function applyBusinessPhone(def: JourneyDefinition, phone: string): JourneyDefinition {
  if (!phone) return def;
  const dialHref = (scheme: "tel" | "sms") => `${scheme}:${telDigits(phone)}`;

  let theme = def.theme;
  if (theme?.banner?.phone) {
    theme = { ...theme, banner: { ...theme.banner, phone } };
  }

  let pagesChanged = false;
  const pages = def.pages.map((p) => {
    if (!p.cta?.length || !p.cta.some(isCallish)) return p;
    pagesChanged = true;
    const cta = p.cta.map((c) =>
      isCallish(c)
        ? {
            ...c,
            value: phone,
            // Keep an explicit href in sync too (some CTAs hardcode tel:/sms:).
            href: c.href ? dialHref(c.href.startsWith("sms:") || c.type === "text" ? "sms" : "tel") : c.href,
          }
        : c,
    );
    return { ...p, cta };
  });

  if (theme === def.theme && !pagesChanged) return def;
  return { ...def, theme, pages: pagesChanged ? pages : def.pages };
}
