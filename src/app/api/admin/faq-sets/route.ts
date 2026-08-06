// Admin endpoint for the org's reusable FAQ library. GET returns all sets; PUT
// replaces the whole list. Sets are stored in the org settings blob and are not
// secret — journeys reference them by id and the public runtime resolves them.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth, authEnabled } from "@/auth";
import { readFaqSets, type FaqSet } from "@/modules/faq/faqSets";
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
  const sets = readFaqSets(await store.getOrgSettings(g.org.id));
  return NextResponse.json({ ok: true, sets });
}

const itemSchema = z.object({
  q: z.string(),
  a: z.string(),
  qEs: z.string().optional(),
  aEs: z.string().optional(),
});

const setSchema = z.object({
  id: z.string(),
  name: z.string(),
  heading: z.string().optional(),
  headingEs: z.string().optional(),
  disclaimer: z.string().optional(),
  disclaimerEs: z.string().optional(),
  items: z.array(itemSchema),
});

const bodySchema = z.object({ sets: z.array(setSchema) });

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
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid FAQ sets." }, { status: 400 });

  // Trim blank fields to keep the stored blob tidy.
  const clean = (v?: string) => {
    const t = v?.trim();
    return t ? t : undefined;
  };
  const sets: FaqSet[] = parsed.data.sets.map((s) => ({
    id: s.id,
    name: s.name.trim() || "Untitled",
    heading: clean(s.heading),
    headingEs: clean(s.headingEs),
    disclaimer: clean(s.disclaimer),
    disclaimerEs: clean(s.disclaimerEs),
    items: s.items
      .map((it) => ({ q: it.q.trim(), a: it.a.trim(), qEs: clean(it.qEs), aEs: clean(it.aEs) }))
      .filter((it) => it.q || it.a),
  }));

  const settings = await store.getOrgSettings(g.org.id);
  await store.saveOrgSettings(g.org.id, { ...settings, faqSets: sets });
  return NextResponse.json({ ok: true, sets });
}
