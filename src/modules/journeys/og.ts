// Build social/link-preview metadata (Open Graph + Twitter card) for a journey.
// The card is about the firm: title = firm name, description = the journey's
// welcome headline, image = the hero photo (or logo) when it's a public URL.

import ReactDOM from "react-dom";
import type { Metadata } from "next";
import type { JourneyDefinition } from "./domain/schema";

/** The page's main headline (first non-"prompt" heading), flattened to one line. */
function journeyHeadline(def: JourneyDefinition): string | undefined {
  for (const page of def.pages) {
    for (const c of page.components) {
      if (c.type === "heading" && c.props?.level !== 2 && c.content) {
        return c.content.replace(/\s*\n\s*/g, " ").trim();
      }
    }
  }
  return undefined;
}

/** First value that is a fetchable http(s) URL (social scrapers reject data: URIs). */
function publicUrl(...candidates: (string | undefined)[]): string | undefined {
  return candidates.find((u) => typeof u === "string" && /^https?:\/\//i.test(u));
}

/**
 * Start downloading the hero photo as early as possible (it's the LCP element).
 * Only helps for hosted images — data: URIs are already inline. Call from a
 * server component during render.
 */
export function preloadHero(def: JourneyDefinition): void {
  const url = publicUrl(def.theme?.sideImageUrl);
  if (url) ReactDOM.preload(url, { as: "image", fetchPriority: "high" });
}

export function journeyMetadata(def: JourneyDefinition, firmName: string): Metadata {
  const theme = def.theme ?? {};
  const firm = firmName || def.name;
  // The document <title> is what GA4 reports as page_title. Make it distinct per
  // journey — "Firm Name — Journey Name" — so journeys don't collapse into one
  // row in Analytics. The link/social preview keeps just the firm name.
  const journeyName = def.name?.trim();
  const autoTitle = journeyName && journeyName !== firm ? `${firm} — ${journeyName}` : firm;
  // A journey-specific SEO title/description (set in the editor) wins over the
  // auto-generated values — this is what keeps Google Ads from falling back to
  // the brand + raw subdomain.
  const docTitle = def.seo?.title?.trim() || autoTitle;
  const description = def.seo?.description?.trim() || journeyHeadline(def) || def.name;
  const image = publicUrl(theme.socialImageUrl, theme.sideImageUrl, theme.logoUrl);
  const images = image ? [{ url: image }] : undefined;

  return {
    title: docTitle,
    description,
    openGraph: {
      type: "website",
      title: firm,
      description,
      siteName: firm || undefined,
      images,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: firm,
      description,
      images: image ? [image] : undefined,
    },
  };
}
