// Admin endpoints to list and connect custom domains for the current org.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth, authEnabled } from "@/auth";
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
  const domains = await store.listDomains(g.org.id);
  return NextResponse.json({ ok: true, domains });
}

const bodySchema = z.object({
  hostname: z.string().min(3),
  journeyId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const g = await guard();
  if (g.error) return g.error;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Enter a valid domain." }, { status: 400 });
  }

  try {
    const domain = await store.addDomain({
      organizationId: g.org.id,
      hostname: parsed.data.hostname,
      journeyId: parsed.data.journeyId || undefined,
    });
    return NextResponse.json({ ok: true, domain });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Could not connect domain." },
      { status: 400 },
    );
  }
}
