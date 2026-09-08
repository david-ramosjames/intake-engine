// Admin endpoint for whether this business's landing pages should tell search
// engines not to index them. Default is on (noindex). Per-journey SEO can
// override.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth, authEnabled } from "@/auth";
import { readNoindexLandings } from "@/modules/settings/indexing";
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
  const noindexLandings = readNoindexLandings(await store.getOrgSettings(g.org.id));
  return NextResponse.json({ ok: true, noindexLandings });
}

const bodySchema = z.object({ noindexLandings: z.boolean() });

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
  const seo =
    settings.seo && typeof settings.seo === "object" ? (settings.seo as Record<string, unknown>) : {};
  await store.saveOrgSettings(g.org.id, {
    ...settings,
    seo: { ...seo, noindexLandings: parsed.data.noindexLandings },
  });
  return NextResponse.json({ ok: true, noindexLandings: parsed.data.noindexLandings });
}
