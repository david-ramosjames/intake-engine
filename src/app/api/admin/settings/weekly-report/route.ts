// Admin: save weekly report recipients / toggle, or send this week's email now.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth, authEnabled } from "@/auth";
import { buildWeeklyReport, sendWeeklyReportEmail } from "@/modules/analytics/weeklyReport";
import { parseWeeklyReportEmails, readWeeklyReport } from "@/modules/settings/weeklyReport";
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
    emailConfigured: Boolean(process.env.RESEND_API_KEY && process.env.AUTOMATION_EMAIL_FROM),
  });
}

const bodySchema = z.object({
  enabled: z.boolean(),
  emails: z.string(),
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

  const weeklyReport = {
    enabled: parsed.data.enabled,
    emails: parseWeeklyReportEmails(parsed.data.emails),
  };
  const settings = await store.getOrgSettings(g.org.id);
  await store.saveOrgSettings(g.org.id, { ...settings, weeklyReport });
  return NextResponse.json({ ok: true, ...weeklyReport });
}

export async function POST() {
  const g = await guard();
  if (g.error) return g.error;
  const cfg = readWeeklyReport(await store.getOrgSettings(g.org.id));
  if (!cfg.emails.length) {
    return NextResponse.json({ ok: false, error: "Add at least one recipient and save first." }, { status: 400 });
  }
  try {
    const report = await buildWeeklyReport(g.org);
    await sendWeeklyReportEmail(cfg.emails, report);
    return NextResponse.json({ ok: true, subject: `${report.orgName}: weekly intake` });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Could not send." },
      { status: 500 },
    );
  }
}
