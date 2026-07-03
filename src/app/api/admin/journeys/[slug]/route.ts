// Admin endpoint to save an edited journey. Validates the incoming definition
// against the canonical schema before persisting (editing creates a new
// published version in DB mode). Scoped to the current admin organization.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { journeyDefinitionSchema } from "@/modules/journeys/domain/schema";
import { getAdminOrg } from "@/server/currentOrg";
import { store } from "@/server/store";

const bodySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  definition: journeyDefinitionSchema,
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const org = await getAdminOrg();
  if (!org) return NextResponse.json({ ok: false, error: "No business selected." }, { status: 400 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid journey definition.", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }

  const existing = await store.getJourney(org.id, slug);
  if (!existing) return NextResponse.json({ ok: false, error: "Journey not found." }, { status: 404 });

  await store.updateJourney(org.id, slug, {
    name: parsed.data.name,
    description: parsed.data.description,
    definition: parsed.data.definition,
  });

  return NextResponse.json({ ok: true });
}
