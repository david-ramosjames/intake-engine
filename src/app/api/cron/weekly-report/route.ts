// Scheduled weekly last-7 vs prior-7 performance email. Railway / cron-job.org
// should GET or POST this with Authorization: Bearer $CRON_SECRET
// (Monday morning Central is a good time — the windows end yesterday).

import { NextResponse, type NextRequest } from "next/server";
import { buildWeeklyReport, sendWeeklyReportEmail } from "@/modules/analytics/weeklyReport";
import { readWeeklyReport } from "@/modules/settings/weeklyReport";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const alt = req.headers.get("x-cron-secret")?.trim() ?? "";
  return bearer === secret || alt === secret;
}

export async function GET(req: NextRequest) {
  return run(req);
}

export async function POST(req: NextRequest) {
  return run(req);
}

async function run(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const orgs = await store.listOrganizations();
  const results: Array<{ org: string; sent?: number; skipped?: string; error?: string }> = [];

  for (const org of orgs) {
    const settings = readWeeklyReport(await store.getOrgSettings(org.id));
    if (!settings.enabled) {
      results.push({ org: org.slug, skipped: "disabled" });
      continue;
    }
    if (!settings.emails.length) {
      results.push({ org: org.slug, skipped: "no recipients" });
      continue;
    }
    try {
      const report = await buildWeeklyReport(org);
      await sendWeeklyReportEmail(settings.emails, report);
      results.push({ org: org.slug, sent: settings.emails.length });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[weekly-report] send failed", org.slug, msg);
      results.push({ org: org.slug, error: msg });
    }
  }

  return NextResponse.json({ ok: true, results });
}
