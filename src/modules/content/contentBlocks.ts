// Reusable content blocks: a small, org-owned library of named paragraph
// sections (a heading + body copy) that journeys can point at
// (theme.content.setId) instead of retyping the same explainer on every
// journey. Sibling to the FAQ library — same storage model (org settings) and
// same live-link behavior: editing a block updates every journey that uses it.

export interface ContentBlock {
  id: string;
  name: string;
  heading?: string;
  headingEs?: string;
  body: string;
  // Spanish body, used when the journey is viewed in Spanish. Falls back to EN.
  bodyEs?: string;
}

const isStr = (v: unknown): v is string => typeof v === "string";

/** Read + shape the content blocks from an org's settings blob. Always an array. */
export function readContentBlocks(settings: Record<string, unknown> | undefined): ContentBlock[] {
  const raw = settings?.contentBlocks;
  if (!Array.isArray(raw)) return [];
  const out: ContentBlock[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const o = entry as Record<string, unknown>;
    if (!isStr(o.id) || !isStr(o.name)) continue;
    out.push({
      id: o.id,
      name: o.name,
      heading: isStr(o.heading) ? o.heading : undefined,
      headingEs: isStr(o.headingEs) ? o.headingEs : undefined,
      body: isStr(o.body) ? o.body : "",
      bodyEs: isStr(o.bodyEs) ? o.bodyEs : undefined,
    });
  }
  return out;
}

export function findContentBlock(
  settings: Record<string, unknown> | undefined,
  id: string | undefined,
): ContentBlock | null {
  if (!id) return null;
  return readContentBlocks(settings).find((b) => b.id === id) ?? null;
}
