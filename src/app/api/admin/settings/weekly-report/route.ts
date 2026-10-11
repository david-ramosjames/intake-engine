// Admin: save weekly report recipients / toggle, or send this week's email now.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth, authEnabled } from "@/auth";
import { sendWeeklyReportForOrg } from "@/modules/analytics/weeklyScheduler";
import { emailDeliveryConfigured } from "@/modules/integrations/email";
import { parseWeeklyReportEmails, readWeeklyReport, weeklyReportBlob } from "@/modules/settings/weeklyReport";
import { getAdminOrg } from "@/server/currentOrg";
import { store } from "@/server/store";

async function guard() {
  if (authEnabled) {
    const session = await auth();
    if (!session?.user) return { error: NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 }) };
  }
  const org = await getAdminOrg();
  if (!org) return { error: NextResponse.json({ ok: false, error: "No business selected." }, { status: 400 }) };
  return { org };
}

export async function GET() {
  const g = await guard();
  if (g.error) return g.error;
  return NextResponse.json({
    ok: true,
    ...readWeeklyReport(await store.getOrgSettings(g.org.id)),
    emailConfigured: emailDeliveryConfigured(),
  });
}

const bodySchema = z.object({
  enabled: z.boolean(),
  emails: z.string(),
  weekday: z.number().int().min(0).max(6),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
});

export async function PUT(req: NextRequest) {
  const g = await guard();
  if (g.error) return g.error;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });

  const settings = await store.getOrgSettings(g.org.id);
  const prev = readWeeklyReport(settings);
  const weeklyReport = weeklyReportBlob({
    enabled: parsed.data.enabled,
    emails: parseWeeklyReportEmails(parsed.data.emails),
    weekday: parsed.data.weekday,
    hour: parsed.data.hour,
    minute: parsed.data.minute,
    lastSentPeriodEnd: prev.lastSentPeriodEnd,
  });
  await store.saveOrgSettings(g.org.id, { ...settings, weeklyReport });
  return NextResponse.json({ ok: true, ...readWeeklyReport({ weeklyReport }) });
}

export async function POST() {
  const g = await guard();
  if (g.error) return g.error;
  try {
    await sendWeeklyReportForOrg(g.org);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Could not send." },
      { status: 500 },
    );
  }
}
