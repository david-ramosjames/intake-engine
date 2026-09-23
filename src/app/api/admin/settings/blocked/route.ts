// Admin endpoint for the org's spam block list (names, phones, emails).
// One entry per line. Matching contacts do not create a lead or Slack post.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth, authEnabled } from "@/auth";
import { parseBlockedLines, readBlockedLeads } from "@/modules/settings/blockedLeads";
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
  return NextResponse.json({ ok: true, ...readBlockedLeads(await store.getOrgSettings(g.org.id)) });
}

const bodySchema = z.object({
  names: z.string(),
  phones: z.string(),
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

  const blockedLeads = {
    names: parseBlockedLines(parsed.data.names),
    phones: parseBlockedLines(parsed.data.phones),
    emails: parseBlockedLines(parsed.data.emails),
  };

  const settings = await store.getOrgSettings(g.org.id);
  await store.saveOrgSettings(g.org.id, { ...settings, blockedLeads });
  return NextResponse.json({ ok: true, ...blockedLeads });
}
