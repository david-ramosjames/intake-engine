// Shared analytics URL + label helpers. Kept out of the client filter module so
// the server page can call them (Next will not run functions from a "use client"
// file during a Server Component render).

export function prettySource(key: string) {
  const k = key.toLowerCase();
  if (k === "direct") return "Direct";
  if (k === "google") return "Google";
  if (k === "facebook") return "Facebook";
  if (k === "bing") return "Bing";
  if (k === "instagram") return "Instagram";
  return key;
}

export function prettyMedium(key: string) {
  const k = key.toLowerCase();
  if (k === "none") return "None";
  if (k === "cpc" || k === "ppc" || k === "paid") return "Paid (CPC)";
  if (k === "organic") return "Organic";
  if (k === "referral") return "Referral";
  if (k === "email") return "Email";
  if (k === "social") return "Social";
  return key;
}

export function prettyLang(key: string) {
  const k = key.toLowerCase();
  if (k === "es") return "Spanish";
  if (k === "en") return "English";
  return key;
}

export function prettyPage(key: string) {
  return key;
}

/** Landing language from a page URL (?lang=es / ?hl= / ?locale=). Default English. */
export function landingLang(url?: string): "en" | "es" {
  if (!url) return "en";
  try {
    const u = new URL(url, "https://local.invalid");
    const raw = (u.searchParams.get("lang") || u.searchParams.get("hl") || u.searchParams.get("locale") || "")
      .trim()
      .toLowerCase();
    if (raw.startsWith("es")) return "es";
    if (raw.startsWith("en")) return "en";
  } catch {
    /* ignore malformed */
  }
  return "en";
}

/** Stable landing URL for filters: host + path + lang, no click ids / UTMs. */
export function landingPageKey(url?: string): string {
  if (!url || url === "—") return "—";
  try {
    const u = new URL(url, "https://local.invalid");
    const host = u.host && u.host !== "local.invalid" ? u.host : "";
    const path = u.pathname.replace(/\/+$/, "") || "/";
    const raw = (u.searchParams.get("lang") || u.searchParams.get("hl") || u.searchParams.get("locale") || "")
      .trim()
      .toLowerCase();
    const lang = raw.startsWith("es") ? "es" : raw.startsWith("en") ? "en" : "";
    const q = lang ? `?lang=${lang}` : "";
    return `${host}${path}${q}` || "—";
  } catch {
    return url.split("#")[0] || "—";
  }
}

export function analyticsHref(opts: {
  range?: string;
  from?: string;
  to?: string;
  source?: string;
  medium?: string;
  lang?: string;
  page?: string;
}) {
  const p = new URLSearchParams();
  if (opts.from || opts.to) {
    if (opts.from) p.set("from", opts.from);
    if (opts.to) p.set("to", opts.to);
  } else {
    p.set("range", opts.range || "30");
  }
  if (opts.source) p.set("source", opts.source);
  if (opts.medium) p.set("medium", opts.medium);
  if (opts.lang) p.set("lang", opts.lang);
  if (opts.page) p.set("page", opts.page);
  return `/admin/analytics?${p.toString()}`;
}
