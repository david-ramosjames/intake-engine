// Admin endpoints to list and create automations for the current org.

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

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("email"), to: z.string(), subject: z.string(), body: z.string() }),
  z.object({ type: z.literal("slack"), webhookUrl: z.string(), message: z.string() }),
]);

const bodySchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean().optional(),
  journeyId: z.string().optional(),
  trigger: z.object({ event: z.string() }).default({ event: "LEAD_COMPLETED" }),
  actions: z.array(actionSchema).default([]),
});

export async function GET() {
  const g = await guard();
  if (g.error) return g.error;
  const automations = await store.listAutomations(g.org.id);
  return NextResponse.json({ ok: true, automations });
}

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
    return NextResponse.json({ ok: false, error: "Invalid automation." }, { status: 400 });
  }

  try {
    const automation = await store.createAutomation({
      organizationId: g.org.id,
      name: parsed.data.name,
      enabled: parsed.data.enabled,
      journeyId: parsed.data.journeyId || undefined,
      trigger: parsed.data.trigger,
      actions: parsed.data.actions,
    });
    return NextResponse.json({ ok: true, automation });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Could not create automation." },
      { status: 400 },
    );
  }
}
