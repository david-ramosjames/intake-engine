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

  // Resolve a referenced FAQ set from the org's library into the definition so
  // the client renders it like inline FAQs. Done immutably — the cached journey
  // definition must not be mutated. If the set was deleted, fall back to any
  // inline items (usually none).
  let definition = journey.definition;
  const faq = definition.theme?.faq;
  if (faq?.setId) {
    const set = findFaqSet(await store.getOrgSettings(org.id), faq.setId);
    const resolvedFaq = set
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
    definition = { ...definition, theme: { ...definition.theme, faq: resolvedFaq } };
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
      <JourneyPlayer
        slug={journey.slug}
        definition={definition}
        attribution={attribution}
        initialLocale={initialLocale}
      />
    </>
  );
}
