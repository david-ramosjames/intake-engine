// Admin endpoint for the org's master "quick callback" card text (English +
// Spanish). Every journey's callback card uses this wording, so it's edited in
// one place instead of per journey. Stored in the org settings blob.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth, authEnabled } from "@/auth";
import { CALLBACK_TEXT_DEFAULTS, readCallbackDefaults } from "@/modules/settings/callbackDefaults";
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
  return NextResponse.json({ ok: true, ...readCallbackDefaults(await store.getOrgSettings(g.org.id)) });
}

// Accept every callback text key (heading/button/secure + field labels), each an
// optional string, so the shape stays in sync with the defaults.
const bodySchema = z.object(
  Object.fromEntries(Object.keys(CALLBACK_TEXT_DEFAULTS).map((k) => [k, z.string().optional()])),
);

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

  // Normalize every known key to a trimmed string; store only non-empty ones
  // (blank = fall back to the built-in default).
  const data = parsed.data as Record<string, string | undefined>;
  const trimmed = Object.fromEntries(
    Object.keys(CALLBACK_TEXT_DEFAULTS).map((k) => [k, (data[k] ?? "").trim()]),
  );
  const callback = Object.fromEntries(Object.entries(trimmed).filter(([, v]) => v !== ""));

  const settings = await store.getOrgSettings(g.org.id);
  await store.saveOrgSettings(g.org.id, { ...settings, callback });
  return NextResponse.json({ ok: true, ...trimmed });
}
