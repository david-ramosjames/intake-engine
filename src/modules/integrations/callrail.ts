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

/** Append a query param if the URL doesn't already have it. */
function urlWithParam(url: string, key: string, value?: string): string {
  if (!url || !value) return url;
  try {
    const u = new URL(url);
    if (!u.searchParams.get(key)) u.searchParams.set(key, value);
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * CallRail's `referrer` field is a source *name* (e.g. google_paid), not the
 * referring URL. Their UI shows whatever we put here as Source when they can't
 * classify a Google Ads click from gclid / a swap.js session.
 */
function callRailReferrerName(context: Record<string, string>, lead: StoredLead): string {
  if (context.gclid || context.gbraid || context.wbraid || context.gad_source) return "google_paid";
  if (context.msclkid) return "bing_paid";
  if (context.fbclid) return "facebook";
  const source = (context.utm_source || lead.source || "").toLowerCase();
  const medium = (context.utm_medium || lead.medium || "").toLowerCase();
  if (source === "google" && (medium === "cpc" || medium === "ppc" || medium === "paid")) return "google_paid";
  if (source === "google") return "google";
  if (source) return source;
  const referring = context.referrer;
  if (referring) {
    try {
      const host = new URL(referring).hostname.replace(/^www\./, "");
      if (host) return host;
    } catch {
      /* not a URL */
    }
    return referring;
  }
  return "direct";
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

  // CallRail requires either a session_id (from swap.js) or ALL THREE of
  // referrer, referring_url and landing_page_url. `referrer` is a source name
  // (google_paid), `referring_url` is the external referrer URL, and
  // landing_page_url should still carry gclid so CallRail classifies Google Ads
  // the same way native form capture does. A direct visit has no referrer URL,
  // which would otherwise get dropped and 400 the request.
  const pageUrl = context.pageUrl || context.landingPage || "";
  const landingPageUrl = urlWithParam(
    urlWithParam(context.landingPage || pageUrl, "gclid", context.gclid),
    "gbraid",
    context.gbraid,
  );
  const referringUrl = context.referrer || landingPageUrl;
  const referrer = callRailReferrerName(context, lead);
  // CallRail parses form_url server-side (URI(form_url)); omitting it makes that
  // parse hit nil and 400 with "bad argument (expected URI object or URI
  // string)". It's the URL of the page the form lives on — the journey page.
  const formUrl = pageUrl || landingPageUrl;

  const body = compact({
    company_id: config.companyId,
    form_data: formData,
    form_url: formUrl,
    referring_url: referringUrl,
    landing_page_url: landingPageUrl,
    referrer,
    session_id: context.callrailSessionId,
    utm_source: context.utm_source ?? lead.source,
    utm_medium: context.utm_medium ?? lead.medium,
    utm_campaign: context.utm_campaign ?? lead.campaign,
    utm_term: context.utm_term,
    utm_content: context.utm_content,
    gclid: context.gclid,
    gbraid: context.gbraid,
    wbraid: context.wbraid,
    fbclid: context.fbclid,
    msclkid: context.msclkid,
  });

  // Base is overridable for testing; defaults to the real CallRail v3 API.
  const base = process.env.CALLRAIL_API_BASE ?? "https://api.callrail.com/v3";
  const endpoint = `${base}/a/${config.accountId}/form_submissions.json`;
  const headers = {
    "content-type": "application/json",
    authorization: `Token token="${config.apiKey}"`,
  };

  let res = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
  // A stale/unknown swap.js session_id can 400; retry without it — the referrer
  // trio + gclid on the landing URL is enough for CallRail to accept the post.
  if (!res.ok && res.status === 400 && body.session_id) {
    const { session_id: _ignored, ...withoutSession } = body;
    const retry = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(withoutSession),
    });
    if (retry.ok) return;
    res = retry;
  }
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
          referring_url: referringUrl,
          landing_page_url: landingPageUrl,
          referrer,
          session_id: Boolean(context.callrailSessionId),
          utm: Object.keys(body).filter((k) =>
            k.startsWith("utm_") || ["gclid", "gbraid", "wbraid", "fbclid", "msclkid"].includes(k),
          ),
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
