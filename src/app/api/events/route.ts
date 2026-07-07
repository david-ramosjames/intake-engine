// Lightweight funnel-event beacon. The runtime player fires opened / started /
// completed / cta_click events (fire-and-forget) so Analytics can build a
// session funnel. Kept cheap and best-effort — failures never affect the visitor.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { store } from "@/server/store";
import { resolvePublicOrg } from "@/server/tenant";

const bodySchema = z.object({
  org: z.string().optional(),
  slug: z.string().optional(),
  sessionId: z.string().min(1).max(100),
  type: z.enum(["opened", "started", "completed", "cta_click"]),
  outcome: z.enum(["lead", "referral", "declined"]).optional(),
  source: z.string().optional(),
  pageUrl: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

    const org = await resolvePublicOrg(parsed.data.org);
    if (!org) return NextResponse.json({ ok: false }, { status: 204 });

    await store.recordEvent({
      orgId: org.id,
      journeySlug: parsed.data.slug,
      sessionId: parsed.data.sessionId,
      type: parsed.data.type,
      outcome: parsed.data.outcome,
      source: parsed.data.source,
      pageUrl: parsed.data.pageUrl,
    });
  } catch {
    // best-effort; swallow
  }
  return NextResponse.json({ ok: true });
}
