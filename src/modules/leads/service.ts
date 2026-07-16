// Lead intake service. Server-authoritative: it re-scores and re-qualifies the
// submitted answers (never trusting the client) and persists the lead via the
// store. Automations (LEAD_COMPLETED) would be triggered here — wired as a TODO
// to the Automation Engine.

import { extractContact, scoreLead, type Answers } from "@/modules/journeys/runtime/engine";
import { outcomeForPageType, type PageType } from "@/modules/journeys/domain/schema";
import { runLeadAutomations } from "@/modules/automations/run";
import { store, type LeadOutcome, type StoredJourney } from "@/server/store";

export interface SubmitResult {
  leadId: string;
  score: number;
  qualified: boolean;
  outcome: LeadOutcome;
}

export interface Attribution {
  source?: string;
  campaign?: string;
  medium?: string;
}

export async function submitLead(
  journey: StoredJourney,
  answers: Answers,
  attribution: Attribution = {},
  endingType?: string,
  context: Record<string, string> = {},
): Promise<SubmitResult> {
  const def = journey.definition;
  const { score, qualified } = scoreLead(def, answers);
  const contact = extractContact(def, answers);

  // Outcome precedence: the ending the flow reached wins; otherwise fall back to
  // score/qualification (lead vs declined).
  const byEnding = endingType ? outcomeForPageType(endingType as PageType) : null;
  const outcome: LeadOutcome = byEnding ?? (qualified ? "lead" : "declined");

  const lead = await store.createLead({
    orgId: journey.orgId,
    journeyId: journey.id,
    journeySlug: journey.slug,
    outcome,
    qualified: outcome === "lead",
    referral: outcome === "referral",
    score,
    answers,
    context,
    displayName: contact.displayName,
    email: contact.email,
    phone: contact.phone,
    source: attribution.source ?? context.utm_source,
    campaign: attribution.campaign ?? context.utm_campaign,
    medium: attribution.medium ?? context.utm_medium,
  });

  // Fire the org's automations for this completed lead (email / Slack). Awaited
  // so it runs before the serverless function returns, but wrapped so a failure
  // never affects the lead submission.
  try {
    await runLeadAutomations(journey, lead);
  } catch (e) {
    console.error("[automation] runLeadAutomations threw", e);
  }

  return { leadId: lead.id, score, qualified: outcome === "lead", outcome };
}
