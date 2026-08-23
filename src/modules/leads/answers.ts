// Turn a lead's raw answers into readable {label, value} rows using the journey
// definition — resolving question labels and mapping choice values to their
// option labels. Shared by the lead detail page and the Slack notification so
// both show the same human-readable Q&A.

import type { JourneyDefinition } from "@/modules/journeys/domain/schema";

export interface AnswerRow {
  key: string;
  label: string;
  value: string;
}

export function answerRows(
  def: JourneyDefinition | undefined,
  answers: Record<string, unknown>,
): AnswerRow[] {
  const byKey = new Map<string, { label: string; options?: { label: string; value: string }[] }>();
  for (const page of def?.pages ?? []) {
    for (const c of page.components) {
      if (c.key) byKey.set(c.key, { label: c.label ?? c.key, options: c.options });
    }
  }
  return Object.entries(answers)
    .filter(([, v]) => v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0))
    .map(([key, raw]) => {
      const meta = byKey.get(key);
      const display = meta?.options
        ? (Array.isArray(raw) ? raw : [raw])
            .map((val) => meta.options?.find((o) => o.value === String(val))?.label ?? String(val))
            .join(", ")
        : Array.isArray(raw)
          ? raw.join(", ")
          : String(raw);
      return { key, label: meta?.label ?? key, value: display };
    });
}

/**
 * True when the answers include a selected option flagged `markReferral` — i.e.
 * the visitor affirmatively chose to be referred (the "Yes" answer on a "Want a
 * referral?" question). Server-authoritative signal for tagging a referral, so a
 * "No" answer is never treated as a referral.
 */
export function answersIndicateReferral(
  def: JourneyDefinition | undefined,
  answers: Record<string, unknown>,
): boolean {
  const optsByKey = new Map<string, { value: string; markReferral?: boolean }[]>();
  for (const page of def?.pages ?? []) {
    for (const c of page.components) {
      if (c.key && c.options) optsByKey.set(c.key, c.options);
    }
  }
  for (const [key, raw] of Object.entries(answers)) {
    const opts = optsByKey.get(key);
    if (!opts) continue;
    const chosen = Array.isArray(raw) ? raw : [raw];
    if (chosen.some((val) => opts.some((o) => o.value === String(val) && o.markReferral))) return true;
  }
  return false;
}
