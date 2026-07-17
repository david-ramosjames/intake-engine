// Public Journey runtime. Resolves the tenant (from host, or `?org=` in demo),
// loads the published journey by slug, and hands the definition to the client
// player. Attribution params (utm_*) are captured for lead source analytics.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JourneyPlayer } from "@/components/runtime/JourneyPlayer";
import { journeyMetadata, preloadHero } from "@/modules/journeys/og";
import { getPublishedJourneyCached } from "@/server/journeyCache";
import { resolvePublicOrg } from "@/server/tenant";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const { slug } = await params;
  const sp = await searchParams;
  const orgParam = typeof sp.org === "string" ? sp.org : undefined;
  const org = await resolvePublicOrg(orgParam);
  if (!org) return {};
  const journey = await getPublishedJourneyCached(org.id, slug);
  if (!journey || journey.status !== "PUBLISHED") return {};
  return journeyMetadata(journey.definition, org.name);
}

export default async function JourneyRuntimePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const pick = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);

  const org = await resolvePublicOrg(pick("org"));
  if (!org) notFound();

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

  return <JourneyPlayer slug={journey.slug} definition={journey.definition} attribution={attribution} />;
}
