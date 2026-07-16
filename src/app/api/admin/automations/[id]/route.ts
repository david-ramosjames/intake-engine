// Admin endpoints to update or delete a single automation.

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

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  journeyId: z.string().nullable().optional(),
  trigger: z.object({ event: z.string() }).optional(),
  actions: z.array(actionSchema).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (g.error) return g.error;
  const { id } = await params;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid update." }, { status: 400 });

  try {
    const automation = await store.updateAutomation(g.org.id, id, parsed.data);
    return NextResponse.json({ ok: true, automation });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Could not update automation." },
      { status: 400 },
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (g.error) return g.error;
  const { id } = await params;
  await store.deleteAutomation(g.org.id, id);
  return NextResponse.json({ ok: true });
}
