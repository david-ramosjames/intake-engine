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

export function analyticsHref(opts: {
  range?: string;
  from?: string;
  to?: string;
  source?: string;
  medium?: string;
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
  return `/admin/analytics?${p.toString()}`;
}
