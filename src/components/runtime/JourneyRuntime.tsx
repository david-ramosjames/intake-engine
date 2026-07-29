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
import { preloadHero } from "@/modules/journeys/og";
import { getPublishedJourneyCached } from "@/server/journeyCache";
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
  preloadHero(journey.definition);

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
        definition={journey.definition}
        attribution={attribution}
        initialLocale={initialLocale}
      />
    </>
  );
}
