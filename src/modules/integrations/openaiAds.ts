// ChatGPT / OpenAI Ads measurement. Pixel ID is public (injected on journey
// pages). The optional Conversions API key stays server-side and is used to
// send the same lead_created event from the backend for more reliable
// attribution (deduped with the browser pixel via the lead id).

import { createHash } from "node:crypto";
import type { StoredLead } from "@/server/store";

export interface OpenAIAdsConfig {
  pixelId?: string;
  apiKey?: string;
}

const PIXEL_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

export function openaiAdsConfig(settings: Record<string, unknown> | undefined): OpenAIAdsConfig | null {
  const c = settings?.openaiAds;
  if (!c || typeof c !== "object") return null;
  return c as OpenAIAdsConfig;
}

export function sanitizePixelId(raw: string | undefined): string | undefined {
  const id = raw?.trim();
  if (!id || !PIXEL_ID_RE.test(id)) return undefined;
  return id;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeEmail(raw: string | undefined): string | undefined {
  const v = raw?.trim().toLowerCase();
  return v && v.includes("@") ? v : undefined;
}

/** Digits-only international form (US 10-digit numbers get a leading 1). */
function normalizePhone(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10) d = `1${d}`;
  if (d.length < 8 || d.length > 15) return undefined;
  return d;
}

function compact<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Best-effort Conversions API post. Requires pixel id + API key. Throws on a
 * non-2xx so the caller can log; never called in a way that blocks lead capture.
 */
export async function forwardLeadToOpenAIAds(
  config: OpenAIAdsConfig,
  lead: StoredLead,
  context: Record<string, string>,
): Promise<void> {
  const pixelId = sanitizePixelId(config.pixelId);
  const apiKey = config.apiKey?.trim();
  if (!pixelId || !apiKey) return;

  const email = normalizeEmail(lead.email);
  const phone = normalizePhone(lead.phone);
  const sourceUrl = context.pageUrl || context.landingPage || "";

  const user = compact({
    obref: context.openaiObref,
    emails_sha256: email ? [sha256(email)] : undefined,
    phone_numbers_sha256: phone ? [sha256(phone)] : undefined,
    external_ids_sha256: [sha256(lead.id)],
    user_agent: context.userAgent,
  });

  const event = compact({
    id: lead.id,
    type: "lead_created",
    timestamp_ms: Date.now(),
    oppref: context.oppref,
    source_url: sourceUrl || undefined,
    action_source: "web",
    user: Object.keys(user).length ? user : undefined,
    data: { type: "customer_action" },
  });

  const res = await fetch(`https://bzr.openai.com/v1/events?pid=${encodeURIComponent(pixelId)}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      validate_only: false,
      integration_source: "intake_engine",
      events: [event],
    }),
  });
  if (!res.ok) {
    const respBody = (await res.text().catch(() => "")).slice(0, 300);
    console.error(
      "[openai-ads] request rejected",
      JSON.stringify({ status: res.status, pixelId, eventId: lead.id, response: respBody }),
    );
    throw new Error(`OpenAI Ads returned ${res.status}. ${respBody}`.trim());
  }
}
