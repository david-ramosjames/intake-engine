// Enriches an already-submitted lead with the fuller set of answers gathered
// after it was first recorded. Used when a journey submits the lead at a
// mid-flow conversion point (firing CallRail / Slack / GA) and the visitor then
// answers more qualifying questions — those later answers are saved back here.
// Server-authoritative: re-scores the answers and only fills the stored record;
// it never re-fires integrations.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { enrichLead } from "@/modules/leads/service";
import { getPublishedJourneyCached } from "@/server/journeyCache";
import { resolvePublicOrg } from "@/server/tenant";

const bodySchema = z.object({
  slug: z.string(),
  org: z.string().optional(),
  answers: z.record(z.unknown()),
  context: z.record(z.string()).optional(),
  endingType: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  const { slug, org: orgParam, answers, context = {}, endingType } = parsed.data;
  const org = await resolvePublicOrg(orgParam);
  if (!org) return NextResponse.json({ ok: false, error: "Unknown tenant." }, { status: 404 });

  const journey = await getPublishedJourneyCached(org.id, slug);
  if (!journey) return NextResponse.json({ ok: false, error: "Journey not found." }, { status: 404 });

  const ok = await enrichLead(journey, id, answers, context, endingType);
  if (!ok) return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
