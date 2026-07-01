// Public Journey runtime. Resolves the tenant from the host, loads the
// published journey by slug, and hands the definition to the client player.
// Attribution params (utm_*) are captured for lead source analytics.

import { notFound } from "next/navigation";
import { JourneyPlayer } from "@/components/runtime/JourneyPlayer";
import { loadPublishedJourney } from "@/modules/journeys/repository";
import { getCurrentTenant } from "@/server/tenant";

export const dynamic = "force-dynamic";

export default async function JourneyRuntimePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();

  const journey = await loadPublishedJourney(tenant.organizationId, slug);
  if (!journey) notFound();

  const pick = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const attribution: Record<string, string> = {};
  const source = pick("utm_source") ?? pick("source");
  const campaign = pick("utm_campaign") ?? pick("campaign");
  const medium = pick("utm_medium") ?? pick("medium");
  if (source) attribution.source = source;
  if (campaign) attribution.campaign = campaign;
  if (medium) attribution.medium = medium;

  return <JourneyPlayer slug={journey.slug} definition={journey.definition} attribution={attribution} />;
}
