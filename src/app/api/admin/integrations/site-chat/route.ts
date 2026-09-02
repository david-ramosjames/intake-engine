// Admin endpoint to read/update the org's chat widget snippet and where it
// shows (desktop / mobile / content & FAQ). The pasted <script> is public —
// we store the URL + client id after sanitizing, never execute the paste as HTML.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth, authEnabled } from "@/auth";
import {
  normalizeSiteChatPlacement,
  parseSiteChatSnippet,
  siteChatConfig,
  type SiteChatConfig,
} from "@/modules/integrations/siteChat";
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

function publicConfig(cfg: SiteChatConfig | null | undefined) {
  const parsed = cfg?.snippet ? parseSiteChatSnippet(cfg.snippet) : null;
  return {
    snippet: cfg?.snippet ?? "",
    clientId: parsed?.clientId ?? cfg?.clientId ?? "",
    placement: normalizeSiteChatPlacement(cfg?.placement),
  };
}

export async function GET() {
  const g = await guard();
  if (g.error) return g.error;
  const cfg = siteChatConfig(await store.getOrgSettings(g.org.id));
  return NextResponse.json({ ok: true, config: publicConfig(cfg) });
}

const bodySchema = z.object({
  snippet: z.string().optional(),
  placement: z
    .object({
      desktop: z.enum(["always", "sections", "off"]).optional(),
      mobile: z.enum(["always", "sections", "off"]).optional(),
      content: z.boolean().optional(),
      faq: z.boolean().optional(),
    })
    .optional(),
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
  const parsedBody = bodySchema.safeParse(json);
  if (!parsedBody.success) return NextResponse.json({ ok: false, error: "Invalid config." }, { status: 400 });

  const snippet = (parsedBody.data.snippet ?? "").trim();
  if (snippet) {
    const parsed = parseSiteChatSnippet(snippet);
    if (!parsed) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Could not read that snippet. Paste the full <script> tag, including src=\"…/widget.js\" and data-client-id.",
        },
        { status: 400 },
      );
    }
  }

  const settings = await store.getOrgSettings(g.org.id);
  const existing = siteChatConfig(settings) ?? {};
  const extracted = snippet ? parseSiteChatSnippet(snippet) : null;
  const placement = normalizeSiteChatPlacement({
    ...normalizeSiteChatPlacement(existing.placement),
    ...parsedBody.data.placement,
  });
  const next: SiteChatConfig = extracted
    ? { snippet, src: extracted.src, clientId: extracted.clientId, placement }
    : { snippet: "", src: undefined, clientId: undefined, placement };
  await store.saveOrgSettings(g.org.id, { ...settings, siteChat: next });

  return NextResponse.json({ ok: true, config: publicConfig(next) });
}
