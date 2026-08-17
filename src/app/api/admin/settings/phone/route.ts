// Admin endpoint for the org's master business phone number. It's applied to
// every journey's call/text buttons and top bar at render, so all landing pages
// show one number — the one CallRail's swap.js is configured to swap.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth, authEnabled } from "@/auth";
import { readBusinessPhone } from "@/modules/settings/businessPhone";
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
  const phone = readBusinessPhone(await store.getOrgSettings(g.org.id));
  return NextResponse.json({ ok: true, phone });
}

const bodySchema = z.object({ phone: z.string() });

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
  const phone = parsed.data.phone.trim();
  await store.saveOrgSettings(g.org.id, { ...settings, phone: phone || undefined });
  return NextResponse.json({ ok: true, phone });
}
