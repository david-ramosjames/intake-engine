// Admin endpoint to read/update the org's ChatGPT Ads pixel. The Conversions
// API key is stored server-side and never returned to the browser — GET reports
// only whether one is set; PUT keeps the existing key when left blank.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth, authEnabled } from "@/auth";
import { openaiAdsConfig, sanitizePixelId } from "@/modules/integrations/openaiAds";
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
  const cfg = openaiAdsConfig(await store.getOrgSettings(g.org.id));
  return NextResponse.json({
    ok: true,
    config: {
      pixelId: cfg?.pixelId ?? "",
      hasKey: Boolean(cfg?.apiKey),
    },
  });
}

const bodySchema = z.object({
  pixelId: z.string().optional(),
  apiKey: z.string().optional(),
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
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid config." }, { status: 400 });

  const rawId = (parsed.data.pixelId ?? "").trim();
  if (rawId && !sanitizePixelId(rawId)) {
    return NextResponse.json(
      { ok: false, error: "Pixel ID should be 8–64 letters, numbers, underscores, or hyphens." },
      { status: 400 },
    );
  }

  const settings = await store.getOrgSettings(g.org.id);
  const existing = openaiAdsConfig(settings) ?? {};
  const next = {
    pixelId: sanitizePixelId(rawId),
    apiKey: parsed.data.apiKey && parsed.data.apiKey.trim() ? parsed.data.apiKey.trim() : existing.apiKey,
  };
  await store.saveOrgSettings(g.org.id, { ...settings, openaiAds: next });

  return NextResponse.json({
    ok: true,
    config: {
      pixelId: next.pixelId ?? "",
      hasKey: Boolean(next.apiKey),
    },
  });
}
