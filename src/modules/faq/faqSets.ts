// Reusable FAQ sets: a small, org-owned library of named FAQ collections that
// journeys can point at (theme.faq.setId) instead of copying the same questions
// into every journey. Stored in the org's settings blob (no separate table);
// journeys reference a set by id and it's resolved at render time, so editing a
// set updates every journey that uses it.

export interface FaqSetItem {
  q: string;
  a: string;
  // Spanish, used when the journey is viewed in Spanish. Falls back to EN.
  qEs?: string;
  aEs?: string;
}

export interface FaqSet {
  id: string;
  name: string;
  heading?: string;
  headingEs?: string;
  disclaimer?: string;
  disclaimerEs?: string;
  items: FaqSetItem[];
}

const isStr = (v: unknown): v is string => typeof v === "string";

function coerceItem(v: unknown): FaqSetItem | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!isStr(o.q) && !isStr(o.a)) return null;
  return {
    q: isStr(o.q) ? o.q : "",
    a: isStr(o.a) ? o.a : "",
    qEs: isStr(o.qEs) ? o.qEs : undefined,
    aEs: isStr(o.aEs) ? o.aEs : undefined,
  };
}

/** Read + shape the FAQ sets from an org's settings blob. Always an array. */
export function readFaqSets(settings: Record<string, unknown> | undefined): FaqSet[] {
  const raw = settings?.faqSets;
  if (!Array.isArray(raw)) return [];
  const out: FaqSet[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const o = entry as Record<string, unknown>;
    if (!isStr(o.id) || !isStr(o.name)) continue;
    out.push({
      id: o.id,
      name: o.name,
      heading: isStr(o.heading) ? o.heading : undefined,
      headingEs: isStr(o.headingEs) ? o.headingEs : undefined,
      disclaimer: isStr(o.disclaimer) ? o.disclaimer : undefined,
      disclaimerEs: isStr(o.disclaimerEs) ? o.disclaimerEs : undefined,
      items: Array.isArray(o.items) ? o.items.map(coerceItem).filter((x): x is FaqSetItem => x !== null) : [],
    });
  }
  return out;
}

export function findFaqSet(settings: Record<string, unknown> | undefined, id: string | undefined): FaqSet | null {
  if (!id) return null;
  return readFaqSets(settings).find((s) => s.id === id) ?? null;
}
