// Optional backup poke. The app also sends on its own from the Settings day/time.
// GET/POST with Authorization: Bearer $CRON_SECRET.

import { NextResponse, type NextRequest } from "next/server";
import { sendDueWeeklyReports } from "@/modules/analytics/weeklyScheduler";

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
  await sendDueWeeklyReports();
  return NextResponse.json({ ok: true });
}
