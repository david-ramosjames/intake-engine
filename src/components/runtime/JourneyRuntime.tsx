// Shared server render for a public journey: loads the published journey for an
// org + slug, wires attribution (utm_*), the GTM container, CallRail call
// tracking, and the starting locale (?lang / hl / locale, then the browser's
// Accept-Language, then the journey default), and hands it to the client player.
// Used by the firm-path route (/<slug>), the /j/<slug> route, and the custom-
// domain root, so all three behave identically.

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { CallRailScript } from "@/components/runtime/CallRailScript";
import { GoogleTagManager } from "@/components/runtime/GoogleTagManager";
import { JourneyPlayer } from "@/components/runtime/JourneyPlayer";
import { localeFromAcceptLanguage, localeFromParam } from "@/modules/journeys/domain/i18n";
import { findFaqSet } from "@/modules/faq/faqSets";
import { findContentBlock } from "@/modules/content/contentBlocks";
import { preloadHero } from "@/modules/journeys/og";
import { getPublishedJourneyCached } from "@/server/journeyCache";
import { store } from "@/server/store";
import type { StoredOrg } from "@/server/store/types";
import { getPublicSiteConfig } from "@/server/tenant";

type SearchParams = Record<string, string | string[] | undefined>;

export async function JourneyRuntime({
  org,
  slug,
  searchParams,
}: {
  org: StoredOrg;
  slug: string;
  searchParams: SearchParams;
}) {
  const pick = (k: string) => (typeof searchParams[k] === "string" ? (searchParams[k] as string) : undefined);

  const journey = await getPublishedJourneyCached(org.id, slug);
  if (!journey || journey.status !== "PUBLISHED") notFound();

  // Resolve any referenced FAQ set / content block from the org's library into
  // the definition so the client renders them like inline content. Done
  // immutably — the cached journey definition must not be mutated. If a set was
  // deleted, fall back to any inline content (usually none).
  let definition = journey.definition;
  const faq = definition.theme?.faq;
  const content = definition.theme?.content;
  if (faq?.setId || content?.setId) {
    const settings = await store.getOrgSettings(org.id);
    const theme = { ...definition.theme };
    if (faq?.setId) {
      const set = findFaqSet(settings, faq.setId);
      theme.faq = set
        ? {
            enabled: faq.enabled,
            setId: faq.setId,
            heading: set.heading,
            headingEs: set.headingEs,
            disclaimer: set.disclaimer,
            disclaimerEs: set.disclaimerEs,
            items: set.items,
          }
        : { ...faq, items: faq.items ?? [] };
    }
    if (content?.setId) {
      const block = findContentBlock(settings, content.setId);
      theme.content = block
        ? {
            enabled: content.enabled,
            setId: content.setId,
            heading: block.heading,
            headingEs: block.headingEs,
            body: block.body,
            bodyEs: block.bodyEs,
          }
        : content;
    }
    definition = { ...definition, theme };
  }

  preloadHero(definition);

  const attribution: Record<string, string> = {};
  const source = pick("utm_source") ?? pick("source");
  const campaign = pick("utm_campaign") ?? pick("campaign");
  const medium = pick("utm_medium") ?? pick("medium");
  if (source) attribution.source = source;
  if (campaign) attribution.campaign = campaign;
  if (medium) attribution.medium = medium;
  attribution.org = org.slug; // so the submit endpoint resolves the same tenant
  attribution.firm = org.name; // logo fallback text

  const { gtmId, callRailSwapUrl } = await getPublicSiteConfig(org.id);
  const languages = journey.definition.languages ?? ["en"];
  const initialLocale =
    localeFromParam(pick("lang") ?? pick("hl") ?? pick("locale"), languages) ??
    localeFromAcceptLanguage((await headers()).get("accept-language"), languages);

  return (
    <>
      <GoogleTagManager gtmId={gtmId} />
      <CallRailScript src={callRailSwapUrl} />
      {/* A strong, keyword-relevant H1 in the server HTML for search engines and
          Google Ads text customization. Visually hidden so it doesn't disturb the
          hero layout; only rendered when set in the journey's SEO settings. Uses
          the Spanish variant when the page is served in Spanish. */}
      {(() => {
        const es = initialLocale?.toLowerCase().startsWith("es");
        const h1 = ((es && definition.seo?.h1Es?.trim()) || definition.seo?.h1?.trim()) || "";
        return h1 ? <h1 className="sr-only">{h1}</h1> : null;
      })()}
      <JourneyPlayer
        slug={journey.slug}
        definition={definition}
        attribution={attribution}
        initialLocale={initialLocale}
      />
    </>
  );
}
