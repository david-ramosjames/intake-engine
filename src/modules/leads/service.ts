// Lead intake service. Server-authoritative: it re-scores and re-qualifies the
// submitted answers (never trusting the client) and persists the lead, its
// normalized answers, and an event-stream entry. Automations would be triggered
// here (LEAD_COMPLETED) — wired as a TODO to the Automation Engine.

import { getPrisma, hasDatabase } from "@/server/db";
import { extractContact, scoreLead, type Answers } from "@/modules/journeys/runtime/engine";
import type { JourneyDefinition } from "@/modules/journeys/domain/schema";
import type { LoadedJourney } from "@/server/demo";

export interface SubmitResult {
  leadId: string;
  score: number;
  qualified: boolean;
  outcome: "qualified" | "declined";
}

export interface Attribution {
  source?: string;
  campaign?: string;
  medium?: string;
  referrer?: string;
}

function labelForKey(def: JourneyDefinition, key: string): string | undefined {
  for (const page of def.pages) {
    for (const c of page.components) {
      if (c.key === key) return c.label;
    }
  }
  return undefined;
}

export async function submitLead(
  journey: LoadedJourney,
  answers: Answers,
  attribution: Attribution = {},
): Promise<SubmitResult> {
  const def = journey.definition;
  const { score, qualified } = scoreLead(def, answers);
  const contact = extractContact(def, answers);
  const outcome: SubmitResult["outcome"] = qualified ? "qualified" : "declined";

  if (!hasDatabase) {
    // DEMO mode: compute the result but skip persistence.
    return { leadId: `demo-${Date.now()}`, score, qualified, outcome };
  }

  const prisma = await getPrisma();
  const lead = await prisma.lead.create({
    data: {
      organizationId: journey.organizationId,
      journeyId: journey.journeyId,
      status: qualified ? "QUALIFIED" : "DISQUALIFIED",
      displayName: contact.displayName,
      email: contact.email,
      phone: contact.phone,
      score,
      qualified,
      answers: answers as object,
      source: attribution.source,
      campaign: attribution.campaign,
      medium: attribution.medium,
      referrer: attribution.referrer,
      completedAt: new Date(),
      leadAnswers: {
        create: Object.entries(answers).map(([key, value]) => ({
          componentKey: key,
          label: labelForKey(def, key),
          valueText: typeof value === "object" ? null : String(value),
          valueNumber: typeof value === "number" ? value : null,
          valueJson: typeof value === "object" ? (value as object) : undefined,
        })),
      },
      events: {
        create: [
          { type: "COMPLETED", payload: {} },
          { type: "SCORED", payload: { score } },
          { type: qualified ? "QUALIFIED" : "DISQUALIFIED", payload: { score } },
        ],
      },
    },
  });

  // TODO(automation-engine): enqueue AutomationRun for trigger LEAD_COMPLETED.

  return { leadId: lead.id, score, qualified, outcome };
}
