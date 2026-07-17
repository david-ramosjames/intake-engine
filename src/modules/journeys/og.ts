// Build social/link-preview metadata (Open Graph + Twitter card) for a journey.
// The card is about the firm: title = firm name, description = the journey's
// welcome headline, image = the hero photo (or logo) when it's a public URL.

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

export function journeyMetadata(def: JourneyDefinition, firmName: string): Metadata {
  const theme = def.theme ?? {};
  const title = firmName || def.name;
  const description = journeyHeadline(def) ?? def.name;
  const image = publicUrl(theme.sideImageUrl, theme.logoUrl);
  const images = image ? [{ url: image }] : undefined;

  return {
    title,
    description,
    openGraph: {
      type: "website",
      title,
      description,
      siteName: firmName || undefined,
      images,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}
