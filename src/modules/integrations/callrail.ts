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
  // Dynamic Number Insertion (call tracking): the CallRail swap.js snippet URL,
  // e.g. "//cdn.callrail.com/companies/<companyId>/<key>/12/swap.js". Independent
  // of the form-submission fields above and injected on the public journey pages.
  swapUrl?: string;
}

/** Read + shape the CallRail config from an org's settings blob. */
export function callRailConfig(settings: Record<string, unknown> | undefined): CallRailConfig | null {
  const c = settings?.callrail;
  if (!c || typeof c !== "object") return null;
  return c as CallRailConfig;
}

/**
 * The CallRail Dynamic Number Insertion (swap.js) script URL to load on public
 * pages, normalized to https. Returns undefined when call tracking isn't set up.
 */
export function callRailSwapScriptUrl(config: CallRailConfig | null): string | undefined {
  let raw = config?.swapUrl?.trim();
  if (!raw) return undefined;
  // Accept a pasted full <script … src="…"> tag: pull the URL out.
  const srcMatch = raw.match(/src\s*=\s*["']([^"']+)["']/i);
  if (srcMatch) raw = srcMatch[1]!.trim();
  // Only ever load a CallRail swap.js over https; ignore anything that doesn't
  // look like a URL to a swap script (defensive — this goes into a <script src>).
  if (!/\bswap\.js\b/.test(raw)) return undefined;
  if (raw.startsWith("//")) return `https:${raw}`;
  if (raw.startsWith("http://")) return `https://${raw.slice(7)}`;
  if (raw.startsWith("https://")) return raw;
  return `https://${raw}`;
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

  // CallRail requires either a session_id (which only exists when its swap.js
  // has tracked the visitor's session client-side) or ALL THREE of referrer,
  // referring_url and landing_page_url. We forward server-side without a session,
  // so send the full trio and fall back so none are empty — a direct visit has
  // no external referrer, which would otherwise get dropped and 400 the request.
  const pageUrl = context.pageUrl || context.landingPage || "";
  const landingPageUrl = context.landingPage || pageUrl;
  const referrer = context.referrer || landingPageUrl;
  // CallRail parses form_url server-side (URI(form_url)); omitting it makes that
  // parse hit nil and 400 with "bad argument (expected URI object or URI
  // string)". It's the URL of the page the form lives on — the journey page.
  const formUrl = pageUrl || landingPageUrl;

  const body = compact({
    company_id: config.companyId,
    form_data: formData,
    form_url: formUrl,
    referring_url: pageUrl,
    landing_page_url: landingPageUrl,
    referrer,
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
    const respBody = (await res.text().catch(() => "")).slice(0, 300);
    // Log the exact shape we sent (field names + URLs, no PII values) so an
    // otherwise-detail-free CallRail 400 can be diagnosed from the server logs.
    console.error(
      "[callrail] request rejected",
      JSON.stringify({
        status: res.status,
        endpoint: `/a/${config.accountId}/form_submissions.json`,
        sent: {
          company_id: config.companyId,
          form_data_fields: Object.keys(formData),
          form_url: formUrl,
          referring_url: pageUrl,
          landing_page_url: landingPageUrl,
          referrer,
          utm: Object.keys(body).filter((k) => k.startsWith("utm_") || ["gclid", "fbclid", "msclkid"].includes(k)),
        },
        response: respBody,
      }),
    );
    const hint =
      res.status === 401
        ? " (check the API key)"
        : res.status === 404
          ? " (check the Account ID)"
          : res.status === 400 || res.status === 422
            ? " (CallRail rejected the request — see the [callrail] request rejected log for the fields sent)"
            : "";
    throw new Error(`CallRail returned ${res.status}${hint}. ${respBody}`.trim());
  }
}
