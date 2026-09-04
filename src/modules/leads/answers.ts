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

// Keys on the landing "Request a callback" card. A lead whose filled answers
// are only these did not go through the qualifying questions.
const CALLBACK_ANSWER_KEYS = new Set(["full_name", "phone", "email", "description"]);

function answerFilled(v: unknown): boolean {
  if (v == null || v === "") return false;
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}

/** True when this record came from the callback form, not the question flow. */
export function isCallbackFormLead(lead: {
  answers?: Record<string, unknown>;
  context?: Record<string, string>;
}): boolean {
  if (lead.context?.intake === "callback") return true;
  const filled = Object.entries(lead.answers ?? {})
    .filter(([, v]) => answerFilled(v))
    .map(([k]) => k);
  return filled.length > 0 && filled.every((k) => CALLBACK_ANSWER_KEYS.has(k));
}
