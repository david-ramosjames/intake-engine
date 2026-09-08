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

function isReferralOfferQuestion(key: string, label?: string): boolean {
  if (key === "want_referral") return true;
  return /want a referral/i.test(label ?? "");
}

/**
 * True when the answers include an affirmative referral choice. A "No" on the
 * referral-offer question is never a referral. Signals, in order:
 *   • option flagged `markReferral`
 *   • option's `goTo` is a page of type `referral`
 *   • "Want a referral?" / `want_referral` answered with anything except the
 *     option that routes to a decline ending (so Yes still counts when it
 *     goes to a contact page before the referral screen)
 */
export function answersIndicateReferral(
  def: JourneyDefinition | undefined,
  answers: Record<string, unknown>,
): boolean {
  const referralPageIds = new Set(
    (def?.pages ?? []).filter((p) => p.type === "referral").map((p) => p.id),
  );
  const declinePageIds = new Set(
    (def?.pages ?? []).filter((p) => p.type === "decline").map((p) => p.id),
  );
  const questions = new Map<
    string,
    { label?: string; options: { value: string; markReferral?: boolean; goTo?: string }[] }
  >();
  for (const page of def?.pages ?? []) {
    for (const c of page.components) {
      if (c.key && c.options) questions.set(c.key, { label: c.label, options: c.options });
    }
  }
  for (const [key, raw] of Object.entries(answers)) {
    const chosen = Array.isArray(raw) ? raw : [raw];
    const q = questions.get(key);
    if (!q) {
      if (key === "want_referral" && chosen.some((val) => /^yes/i.test(String(val)))) return true;
      continue;
    }
    const picked = q.options.filter((o) => chosen.some((val) => o.value === String(val)));
    if (picked.some((o) => o.markReferral || (o.goTo != null && referralPageIds.has(o.goTo)))) {
      return true;
    }
    if (isReferralOfferQuestion(key, q.label) && picked.some((o) => !/^no/i.test(o.value) && (!o.goTo || !declinePageIds.has(o.goTo)))) {
      return true;
    }
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
