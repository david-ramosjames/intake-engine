// Admin endpoint for the org's reusable content-block library. GET returns all
// blocks; PUT replaces the whole list. Blocks are stored in the org settings
// blob and are not secret — journeys reference them by id and the public runtime
// resolves them. Sibling of /api/admin/faq-sets.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth, authEnabled } from "@/auth";
import { readContentBlocks, type ContentBlock } from "@/modules/content/contentBlocks";
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
  const blocks = readContentBlocks(await store.getOrgSettings(g.org.id));
  return NextResponse.json({ ok: true, blocks });
}

const blockSchema = z.object({
  id: z.string(),
  name: z.string(),
  heading: z.string().optional(),
  headingEs: z.string().optional(),
  body: z.string(),
  bodyEs: z.string().optional(),
});

const bodySchema = z.object({ blocks: z.array(blockSchema) });

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
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid content blocks." }, { status: 400 });

  const clean = (v?: string) => {
    const t = v?.trim();
    return t ? t : undefined;
  };
  const blocks: ContentBlock[] = parsed.data.blocks.map((b) => ({
    id: b.id,
    name: b.name.trim() || "Untitled",
    heading: clean(b.heading),
    headingEs: clean(b.headingEs),
    body: b.body.trim(),
    bodyEs: clean(b.bodyEs),
  }));

  const settings = await store.getOrgSettings(g.org.id);
  await store.saveOrgSettings(g.org.id, { ...settings, contentBlocks: blocks });
  return NextResponse.json({ ok: true, blocks });
}
