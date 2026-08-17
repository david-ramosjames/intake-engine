// Admin endpoint for the org's default e-signature contracts (DocuSeal template
// IDs, one English + one Spanish). A journey's sign step inherits these when its
// own template IDs are blank, so contracts are managed in one place.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth, authEnabled } from "@/auth";
import { readSigningDefaults } from "@/modules/settings/signingDefaults";
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
  return NextResponse.json({ ok: true, ...readSigningDefaults(await store.getOrgSettings(g.org.id)) });
}

const bodySchema = z.object({ templateIdEn: z.string(), templateIdEs: z.string() });

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

  const templateIdEn = parsed.data.templateIdEn.trim();
  const templateIdEs = parsed.data.templateIdEs.trim();
  const settings = await store.getOrgSettings(g.org.id);
  await store.saveOrgSettings(g.org.id, {
    ...settings,
    signing: { templateIdEn: templateIdEn || undefined, templateIdEs: templateIdEs || undefined },
  });
  return NextResponse.json({ ok: true, templateIdEn, templateIdEs });
}
