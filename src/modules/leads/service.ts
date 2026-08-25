// Lead intake service. Server-authoritative: it re-scores and re-qualifies the
// submitted answers (never trusting the client) and persists the lead via the
// store. Automations (LEAD_COMPLETED) would be triggered here — wired as a TODO
// to the Automation Engine.

import { extractContact, scoreLead, type Answers } from "@/modules/journeys/runtime/engine";
import { deriveAttribution } from "@/modules/leads/attribution";
import { answersIndicateReferral } from "@/modules/leads/answers";
import { outcomeForPageType, type PageType } from "@/modules/journeys/domain/schema";
import { runLeadAutomations } from "@/modules/automations/run";
import { callRailConfig, forwardLeadToCallRail } from "@/modules/integrations/callrail";
import { openaiAdsConfig, forwardLeadToOpenAIAds } from "@/modules/integrations/openaiAds";
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

  // A referral is a *successful* referral only: the visitor chose the affirmative
  // answer on a "Want a referral?" question (an option flagged markReferral), or
  // the flow reached a referral-type ending. A "No" answer is never a referral.
  const byEnding = endingType ? outcomeForPageType(endingType as PageType) : null;
  const referral = byEnding === "referral" || answersIndicateReferral(def, answers);
  // Outcome precedence: a successful referral wins; then the ending the flow
  // reached; otherwise fall back to score/qualification (lead vs declined).
  const outcome: LeadOutcome = referral ? "referral" : (byEnding ?? (qualified ? "lead" : "declined"));

  // Resolve source/medium/campaign: explicit UTMs win, else infer from click
  // ids (gclid/gbraid → Google Ads) and referrer so paid/organic traffic isn't
  // logged as "direct".
  const derived = deriveAttribution(attribution, context);

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
    source: derived.source,
    campaign: derived.campaign,
    medium: derived.medium,
  });

  // Fire the org's automations for this completed lead (email / Slack). Awaited
  // so it runs before the serverless function returns, but wrapped so a failure
  // never affects the lead submission.
  try {
    await runLeadAutomations(journey, lead);
  } catch (e) {
    console.error("[automation] runLeadAutomations threw", e);
  }

  const settings = await store.getOrgSettings(journey.orgId);

  // Forward to CallRail as a form submission (attribution for Google Ads), when
  // the org has configured the integration. Best-effort.
  try {
    const cfg = callRailConfig(settings);
    if (cfg) await forwardLeadToCallRail(cfg, lead, context);
  } catch (e) {
    console.error("[callrail] forward failed", e);
  }

  // ChatGPT Ads Conversions API (same lead_created event the browser pixel
  // sends, keyed by lead id so OpenAI can dedupe). Best-effort.
  try {
    const cfg = openaiAdsConfig(settings);
    if (cfg) await forwardLeadToOpenAIAds(cfg, lead, context);
  } catch (e) {
    console.error("[openai-ads] forward failed", e);
  }

  return { leadId: lead.id, score, qualified: outcome === "lead", outcome };
}

// Enrich an already-submitted lead with the answers gathered after it was first
// recorded (e.g. the lead fired at a mid-flow conversion point, then the visitor
// answered more qualifying questions). Re-scores and fills in any contact info
// captured later. Also promotes the lead to a referral if it later passed
// through a referral screen — re-running automations (Slack/email) so the team
// sees the corrected classification. Never re-forwards CallRail.
export async function enrichLead(
  journey: StoredJourney,
  leadId: string,
  answers: Answers,
  context: Record<string, string> = {},
): Promise<boolean> {
  const def = journey.definition;
  const { score } = scoreLead(def, answers);
  const contact = extractContact(def, answers);
  const current = await store.getLead(journey.orgId, leadId);
  // Promote to a referral if the fuller answers now include the affirmative
  // referral choice — but never downgrade one already recorded as a referral.
  const becomesReferral = answersIndicateReferral(def, answers) && current?.outcome !== "referral";
  const updated = await store.updateLead(journey.orgId, leadId, {
    answers,
    score,
    displayName: contact.displayName,
    email: contact.email,
    phone: contact.phone,
    context: Object.keys(context).length ? context : undefined,
    outcome: becomesReferral ? "referral" : undefined,
  });
  if (updated && becomesReferral) {
    try {
      await runLeadAutomations(journey, updated);
    } catch (e) {
      console.error("[automation] enrich re-notify threw", e);
    }
  }
  return Boolean(updated);
}
