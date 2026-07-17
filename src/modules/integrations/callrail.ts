// CallRail Form Capture. Forwards a completed lead into CallRail as a form
// submission (v3 Form Submissions API) so it appears alongside calls and is
// attributed for Google Ads conversions (GCLID, UTMs, landing page, referrer).
//
// Credentials live in the org's server-side settings (org.settings.callrail),
// never in the journey definition (which is sent to the browser).

import type { StoredLead } from "@/server/store";

export interface CallRailConfig {
  enabled?: boolean;
  accountId?: string; // alphanumeric, e.g. "250446909" — the /a/<id> segment
  companyId?: string; // numeric, e.g. "984308652"
  apiKey?: string;
  formId?: string; // optional label to group submissions in CallRail
}

/** Read + shape the CallRail config from an org's settings blob. */
export function callRailConfig(settings: Record<string, unknown> | undefined): CallRailConfig | null {
  const c = settings?.callrail;
  if (!c || typeof c !== "object") return null;
  return c as CallRailConfig;
}

export function callRailReady(c: CallRailConfig | null): c is CallRailConfig {
  return Boolean(c && c.enabled && c.accountId && c.companyId && c.apiKey);
}

// Drop empty/undefined values so we don't post blank attribution fields.
function compact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== "") out[k] = v;
  }
  return out;
}

/**
 * Send a lead to CallRail as a form submission. Best-effort — the caller wraps
 * this so a failure never affects lead capture. Returns nothing; throws on a
 * non-2xx response so the caller can log it.
 */
export async function forwardLeadToCallRail(
  config: CallRailConfig,
  lead: StoredLead,
  context: Record<string, string>,
): Promise<void> {
  if (!callRailReady(config)) return;

  const description =
    typeof lead.answers?.description === "string" ? (lead.answers.description as string) : undefined;

  const formData = compact({
    name: lead.displayName,
    email: lead.email,
    phone: lead.phone,
    message: description,
    form_id: config.formId,
  });

  const body = compact({
    company_id: config.companyId,
    form_data: formData,
    form_url: context.pageUrl,
    landing_page_url: context.landingPage ?? context.pageUrl,
    referrer: context.referrer,
    utm_source: context.utm_source ?? lead.source,
    utm_medium: context.utm_medium ?? lead.medium,
    utm_campaign: context.utm_campaign ?? lead.campaign,
    utm_term: context.utm_term,
    utm_content: context.utm_content,
    gclid: context.gclid,
    fbclid: context.fbclid,
    msclkid: context.msclkid,
  });

  // Base is overridable for testing; defaults to the real CallRail v3 API.
  const base = process.env.CALLRAIL_API_BASE ?? "https://api.callrail.com/v3";
  const res = await fetch(`${base}/a/${config.accountId}/form_submissions.json`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Token token="${config.apiKey}"`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`CallRail ${res.status}: ${await res.text().catch(() => "")}`);
  }
}
