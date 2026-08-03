// Starts a contract signing for a "sign" step. Picks the DocuSeal template for
// the current language, then asks Sign Flow to create a pre-filled submission
// (no immediate SMS/email — the visitor signs inline; Sign Flow's reminder
// schedule follows up if they don't). Returns the signing URL to embed.
//
// Connection is configured server-side via env:
//   SIGNFLOW_BASE_URL     e.g. https://ramos-james-law-document.up.railway.app  (Sign Flow, not DocuSeal)
//   SIGNFLOW_INTAKE_TOKEN shared bearer token (must match Sign Flow's SIGNFLOW_INTAKE_TOKEN)

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { extractContact } from "@/modules/journeys/runtime/engine";
import { getPublishedJourneyCached } from "@/server/journeyCache";
import { resolvePublicOrg } from "@/server/tenant";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  slug: z.string(),
  pageId: z.string(),
  locale: z.string().optional(),
  answers: z.record(z.unknown()).default({}),
  org: z.string().optional(),
});

export async function POST(req: NextRequest) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  const { slug, pageId, locale = "en", answers, org: orgParam } = parsed.data;

  const org = await resolvePublicOrg(orgParam);
  if (!org) return NextResponse.json({ ok: false, error: "Unknown tenant." }, { status: 404 });
  const journey = await getPublishedJourneyCached(org.id, slug);
  if (!journey) return NextResponse.json({ ok: false, error: "Journey not found." }, { status: 404 });

  const page = journey.definition.pages.find((p) => p.id === pageId && p.type === "sign");
  const signing = page?.signing;
  if (!signing) return NextResponse.json({ ok: false, error: "Not a sign step." }, { status: 400 });

  // Pick the template for the language (contracts differ EN vs ES).
  const isEs = locale.toLowerCase().startsWith("es");
  const templateId = (isEs ? signing.templateIdEs : signing.templateIdEn) || signing.templateIdEn;

  // No template configured → fall back to the static link, if any.
  const base = process.env.SIGNFLOW_BASE_URL?.trim().replace(/\/+$/, "");
  const token = process.env.SIGNFLOW_INTAKE_TOKEN?.trim();
  if (!templateId || !base || !token) {
    if (signing.url) return NextResponse.json({ ok: true, signingUrl: signing.url });
    return NextResponse.json({ ok: false, error: "Signing isn’t configured." }, { status: 400 });
  }

  const contact = extractContact(journey.definition, answers);
  try {
    const res = await fetch(`${base}/api/intake`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        clientName: contact.displayName ?? "",
        phone: contact.phone ?? null,
        email: contact.email ?? null,
        language: isEs ? "es" : "en",
        templateId,
        source: `intake:${slug}`,
        sendSms: false,
        sendEmail: false,
        reminderEnabled: true,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { signingUrl?: string; error?: unknown };
    if (!res.ok || !data.signingUrl) {
      const msg = typeof data.error === "string" ? data.error : `Sign Flow returned ${res.status}.`;
      // Fall back to a static link if provided.
      if (signing.url) return NextResponse.json({ ok: true, signingUrl: signing.url });
      return NextResponse.json({ ok: false, error: msg }, { status: 502 });
    }
    return NextResponse.json({ ok: true, signingUrl: data.signingUrl });
  } catch (e) {
    if (signing.url) return NextResponse.json({ ok: true, signingUrl: signing.url });
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Could not reach Sign Flow." },
      { status: 502 },
    );
  }
}
