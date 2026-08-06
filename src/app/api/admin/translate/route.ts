// Generic admin translation endpoint: translate a batch of {key,text} strings to
// a target locale via OpenAI and return {key: translation}. Nothing is persisted
// — the caller reviews and saves. Used by the FAQ library builder (and anywhere
// else that isn't tied to a single journey).

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth, authEnabled } from "@/auth";
import { translateItems } from "@/modules/integrations/translate";
import { getAdminOrg } from "@/server/currentOrg";

async function guard() {
  if (authEnabled) {
    const session = await auth();
    if (!session?.user) return { error: NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 }) };
  }
  const org = await getAdminOrg();
  if (!org) return { error: NextResponse.json({ ok: false, error: "No business selected." }, { status: 400 }) };
  return { org };
}

const bodySchema = z.object({
  targetLocale: z.string().min(2).max(8),
  items: z.array(z.object({ key: z.string().min(1), text: z.string().min(1) })).min(1).max(500),
});

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
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });

  const totalChars = parsed.data.items.reduce((n, it) => n + it.text.length, 0);
  if (totalChars > 60_000) {
    return NextResponse.json({ ok: false, error: "Too much text to translate at once." }, { status: 413 });
  }

  try {
    const translations = await translateItems(parsed.data.items, parsed.data.targetLocale);
    return NextResponse.json({ ok: true, translations });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Translation failed." },
      { status: 502 },
    );
  }
}
