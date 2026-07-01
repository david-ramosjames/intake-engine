// Lead submission endpoint. Server-authoritative: it reloads the journey by
// slug for the resolved tenant, then re-scores & re-qualifies the submitted
// answers (the client's computed values are never trusted).

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { loadPublishedJourney } from "@/modules/journeys/repository";
import { submitLead } from "@/modules/leads/service";
import { getCurrentTenant } from "@/server/tenant";

const bodySchema = z.object({
  slug: z.string(),
  answers: z.record(z.unknown()),
  attribution: z.record(z.string()).optional(),
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

  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ ok: false, error: "Unknown tenant." }, { status: 404 });

  const journey = await loadPublishedJourney(tenant.organizationId, parsed.data.slug);
  if (!journey) return NextResponse.json({ ok: false, error: "Journey not found." }, { status: 404 });

  const result = await submitLead(journey, parsed.data.answers, parsed.data.attribution ?? {});

  return NextResponse.json({
    ok: true,
    leadId: result.leadId,
    outcome: result.outcome,
  });
}
