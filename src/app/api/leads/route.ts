// Lead submission endpoint. Server-authoritative: it reloads the journey by
// slug for the resolved tenant, then re-scores & re-qualifies the submitted
// answers (the client's computed values are never trusted).

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { submitLead } from "@/modules/leads/service";
import { getPublishedJourneyCached } from "@/server/journeyCache";
import { resolvePublicOrg } from "@/server/tenant";

const bodySchema = z.object({
  slug: z.string(),
  answers: z.record(z.unknown()),
  attribution: z.record(z.string()).optional(),
  // The type of ending screen the flow reached (success/referral/decline/end).
  endingType: z.string().optional(),
  // The visitor passed through a referral screen → record as a referral.
  referral: z.boolean().optional(),
  // Browser-captured source context (page URL, referrer, user agent, utm_*).
  context: z.record(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const { slug, answers, attribution = {}, endingType, referral, context = {} } = parsed.data;
  const org = await resolvePublicOrg(attribution.org);
  if (!org) return NextResponse.json({ ok: false, error: "Unknown tenant." }, { status: 404 });

  const journey = await getPublishedJourneyCached(org.id, slug);
  if (!journey) return NextResponse.json({ ok: false, error: "Journey not found." }, { status: 404 });

  const result = await submitLead(journey, answers, attribution, endingType, context, referral);

  return NextResponse.json({ ok: true, leadId: result.leadId, outcome: result.outcome });
}
