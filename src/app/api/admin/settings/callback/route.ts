// Admin endpoint for the org's master "quick callback" card text (English +
// Spanish). Every journey's callback card uses this wording, so it's edited in
// one place instead of per journey. Stored in the org settings blob.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth, authEnabled } from "@/auth";
import { readCallbackDefaults } from "@/modules/settings/callbackDefaults";
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

const bodySchema = z.object({
  heading: z.string(),
  headingEs: z.string(),
  buttonLabel: z.string(),
  buttonLabelEs: z.string(),
  buttonSubtitle: z.string(),
  buttonSubtitleEs: z.string(),
  secureText: z.string(),
  secureTextEs: z.string(),
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

  // Trim each field; store only non-empty ones (blank = fall back to built-in).
  const trimmed = Object.fromEntries(
    Object.entries(parsed.data).map(([k, v]) => [k, v.trim()]),
  ) as z.infer<typeof bodySchema>;
  const callback = Object.fromEntries(Object.entries(trimmed).filter(([, v]) => v !== ""));

  const settings = await store.getOrgSettings(g.org.id);
  await store.saveOrgSettings(g.org.id, { ...settings, callback });
  return NextResponse.json({ ok: true, ...trimmed });
}
