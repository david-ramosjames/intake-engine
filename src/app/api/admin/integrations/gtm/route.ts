// Admin endpoint to read/update the org's Google Tag Manager container id.

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

function readContainerId(settings: Record<string, unknown>): string {
  const gtm = settings.gtm as { containerId?: string } | undefined;
  return gtm?.containerId ?? "";
}

export async function GET() {
  const g = await guard();
  if (g.error) return g.error;
  const settings = await store.getOrgSettings(g.org.id);
  return NextResponse.json({ ok: true, containerId: readContainerId(settings) });
}

const bodySchema = z.object({ containerId: z.string() });

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
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid container id." }, { status: 400 });

  const containerId = parsed.data.containerId.trim();
  // Light validation: GTM ids look like GTM-XXXXXX. Allow empty to clear.
  if (containerId && !/^GTM-[A-Z0-9]+$/i.test(containerId)) {
    return NextResponse.json(
      { ok: false, error: "Container id should look like GTM-XXXXXX." },
      { status: 400 },
    );
  }

  const settings = await store.getOrgSettings(g.org.id);
  await store.saveOrgSettings(g.org.id, { ...settings, gtm: { containerId: containerId || undefined } });
  return NextResponse.json({ ok: true, containerId });
}
