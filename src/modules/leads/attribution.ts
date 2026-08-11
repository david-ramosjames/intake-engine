// Work out a lead's traffic source/medium/campaign. Explicit UTMs win; when
// they're absent (e.g. Google Ads auto-tagging, which sends gclid/gbraid but no
// utm_source), infer from click ids and the referrer so paid/organic/referral
// traffic isn't mislabeled as "direct".

export interface DerivedAttribution {
  source?: string;
  medium?: string;
  campaign?: string;
}

interface AttrInput {
  source?: string;
  medium?: string;
  campaign?: string;
}

const SEARCH_ENGINES = ["google", "bing", "yahoo", "duckduckgo", "ecosia", "baidu", "yandex"];

function hostOf(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function deriveAttribution(attr: AttrInput, context: Record<string, string>): DerivedAttribution {
  const source = attr.source || context.utm_source;
  const medium = attr.medium || context.utm_medium;
  const campaign = attr.campaign || context.utm_campaign || context.gad_campaignid || context.campaignid;

  // An explicit source (manual UTM) always wins.
  if (source) return { source, medium, campaign };

  // Paid-click identifiers, in order of specificity.
  if (context.gclid || context.gbraid || context.wbraid || context.gad_source) {
    return { source: "google", medium: medium || "cpc", campaign };
  }
  if (context.fbclid) return { source: "facebook", medium: medium || "cpc", campaign };
  if (context.msclkid) return { source: "bing", medium: medium || "cpc", campaign };

  // Otherwise fall back to the referrer: a search engine → organic, another
  // site → referral, same site / none → direct.
  const host = hostOf(context.referrer);
  if (host) {
    const engine = SEARCH_ENGINES.find((e) => host.includes(e));
    if (engine) return { source: engine, medium: medium || "organic", campaign };
    const landingHost = hostOf(context.landingPage || context.pageUrl);
    if (host !== landingHost) return { source: host, medium: medium || "referral", campaign };
  }
  return { source: undefined, medium, campaign };
}
