// Browser-side capture of the visitor's first-touch attribution. Google Ads
// auto-tagging puts gclid on the landing URL (and later in the _gcl_aw cookie);
// CallRail's swap.js stores a session_id. We snapshot those on first load so a
// later submit still has them even if the address bar was cleaned up.

export const ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "msclkid",
  "gbraid",
  "wbraid",
  "gad_source",
  "gad_campaignid",
  "campaignid",
  "oppref",
] as const;

const FIRST_TOUCH_KEY = "ie_first_touch";

function cookieValue(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  for (const part of document.cookie.split("; ")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = decodeURIComponent(part.slice(0, eq));
    if (key === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1));
      } catch {
        return part.slice(eq + 1);
      }
    }
  }
  return undefined;
}

/** Google Conversion Linker cookie: GCL.<timestamp>.<gclid> */
function gclidFromGclAw(): string | undefined {
  const raw = cookieValue("_gcl_aw");
  if (!raw) return undefined;
  const parts = raw.split(".");
  if (parts.length >= 3 && parts[0] === "GCL") return parts.slice(2).join(".") || undefined;
  return undefined;
}

function gbraidFromCookie(): string | undefined {
  const raw = cookieValue("_gcl_gb");
  if (!raw) return undefined;
  const parts = raw.split(".");
  if (parts.length >= 3 && parts[0] === "GCL") return parts.slice(2).join(".") || undefined;
  return undefined;
}

function callRailSessionId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const ct = (window as unknown as { CallTrk?: { session_id?: string | (() => string) } }).CallTrk;
  if (ct) {
    const fromJs = typeof ct.session_id === "function" ? ct.session_id() : ct.session_id;
    if (typeof fromJs === "string" && fromJs.trim()) return fromJs.trim();
  }
  const named =
    cookieValue("calltrk_session_id") ||
    cookieValue("calltrk-calltrk_session_id") ||
    cookieValue("calltrk_session");
  if (named?.trim()) return named.trim();
  if (typeof document === "undefined") return undefined;
  for (const part of document.cookie.split("; ")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = decodeURIComponent(part.slice(0, eq));
    if (/calltrk.*session_id/i.test(key)) {
      try {
        const v = decodeURIComponent(part.slice(eq + 1)).trim();
        if (v) return v;
      } catch {
        const v = part.slice(eq + 1).trim();
        if (v) return v;
      }
    }
  }
  return undefined;
}

function paramsFromUrl(href: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const params = new URL(href).searchParams;
    for (const k of ATTRIBUTION_KEYS) {
      const v = params.get(k);
      if (v) out[k] = v;
    }
  } catch {
    /* ignore malformed */
  }
  return out;
}

/** Persist the landing URL / referrer / click ids once per tab. */
export function snapshotFirstTouch(): void {
  if (typeof window === "undefined") return;
  try {
    if (sessionStorage.getItem(FIRST_TOUCH_KEY)) return;
    const snap: Record<string, string> = {
      landingPage: window.location.href,
      referrer: document.referrer || "",
      ...paramsFromUrl(window.location.href),
    };
    sessionStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(snap));
  } catch {
    /* sessionStorage blocked */
  }
}

function readFirstTouch(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(FIRST_TOUCH_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string" && v) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Attribution context sent with the lead. First-touch landing/referrer/click
 * ids win over whatever is on the URL at submit time; the current page is
 * still recorded as pageUrl (the form URL).
 */
export function collectContext(): Record<string, string> {
  if (typeof window === "undefined") return {};
  snapshotFirstTouch();
  const first = readFirstTouch();
  const fromUrl = paramsFromUrl(window.location.href);

  const ctx: Record<string, string> = {
    pageUrl: window.location.href,
    landingPage: first.landingPage || window.location.href,
    referrer: first.referrer || document.referrer || "",
    userAgent: navigator.userAgent,
  };

  for (const k of ATTRIBUTION_KEYS) {
    const v = fromUrl[k] || first[k];
    if (v) ctx[k] = v;
  }
  if (!ctx.gclid) {
    const fromCookie = gclidFromGclAw();
    if (fromCookie) ctx.gclid = fromCookie;
  }
  if (!ctx.gbraid) {
    const fromCookie = gbraidFromCookie();
    if (fromCookie) ctx.gbraid = fromCookie;
  }
  const sessionId = callRailSessionId();
  if (sessionId) ctx.callrailSessionId = sessionId;
  if (!ctx.oppref) {
    const fromCookie = cookieValue("__oppref");
    if (fromCookie) ctx.oppref = fromCookie;
  }
  const obref = cookieValue("__obref");
  if (obref) ctx.openaiObref = obref;
  return ctx;
}
