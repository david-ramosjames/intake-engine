// Enriches an already-submitted lead with the fuller set of answers gathered
// after it was first recorded. Used when a journey submits the lead at a
// mid-flow conversion point (firing CallRail / Slack / GA) and the visitor then
// answers more qualifying questions — those later answers are saved back here.
// Also accepts extraDetail from the optional success-screen follow-up form.
// Server-authoritative: it never re-fires CallRail / ads.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { addLeadMoreDetail, enrichLead } from "@/modules/leads/service";
import { getPublishedJourneyCached } from "@/server/journeyCache";
import { resolvePublicOrg } from "@/server/tenant";

const bodySchema = z.object({
  slug: z.string(),
  org: z.string().optional(),
  answers: z.record(z.unknown()).optional(),
  context: z.record(z.string()).optional(),
  endingType: z.string().optional(),
  extraDetail: z.string().optional(),
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

  const { slug, org: orgParam, answers, context = {}, endingType, extraDetail } = parsed.data;
  const org = await resolvePublicOrg(orgParam);
  if (!org) return NextResponse.json({ ok: false, error: "Unknown tenant." }, { status: 404 });

  const journey = await getPublishedJourneyCached(org.id, slug);
  if (!journey) return NextResponse.json({ ok: false, error: "Journey not found." }, { status: 404 });

  if (typeof extraDetail === "string") {
    const ok = await addLeadMoreDetail(journey, id, extraDetail);
    if (!ok) return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  if (!answers) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });

  const ok = await enrichLead(journey, id, answers, context, endingType);
  if (!ok) return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
