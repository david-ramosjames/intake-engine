// Admin endpoint to read/update the org's CallRail Form Capture config. The API
// key is stored server-side and never returned to the browser — the GET reports
// only whether one is set; the PUT keeps the existing key when left blank.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth, authEnabled } from "@/auth";
import { callRailConfig } from "@/modules/integrations/callrail";
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
  const cfg = callRailConfig(await store.getOrgSettings(g.org.id));
  return NextResponse.json({
    ok: true,
    config: {
      enabled: cfg?.enabled ?? false,
      accountId: cfg?.accountId ?? "",
      companyId: cfg?.companyId ?? "",
      formId: cfg?.formId ?? "",
      hasKey: Boolean(cfg?.apiKey),
    },
  });
}

const bodySchema = z.object({
  enabled: z.boolean().optional(),
  accountId: z.string().optional(),
  companyId: z.string().optional(),
  formId: z.string().optional(),
  apiKey: z.string().optional(), // blank/absent = keep the existing key
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

  const settings = await store.getOrgSettings(g.org.id);
  const existing = callRailConfig(settings) ?? {};
  const next = {
    enabled: parsed.data.enabled ?? existing.enabled ?? false,
    accountId: (parsed.data.accountId ?? existing.accountId ?? "").trim(),
    companyId: (parsed.data.companyId ?? existing.companyId ?? "").trim(),
    formId: (parsed.data.formId ?? existing.formId ?? "").trim() || undefined,
    // Only overwrite the key when a new non-empty value is supplied.
    apiKey: parsed.data.apiKey && parsed.data.apiKey.trim() ? parsed.data.apiKey.trim() : existing.apiKey,
  };
  await store.saveOrgSettings(g.org.id, { ...settings, callrail: next });

  return NextResponse.json({
    ok: true,
    config: {
      enabled: next.enabled,
      accountId: next.accountId,
      companyId: next.companyId,
      formId: next.formId ?? "",
      hasKey: Boolean(next.apiKey),
    },
  });
}
