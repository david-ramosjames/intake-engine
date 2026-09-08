// Public Journey runtime at /j/<slug> (kept for existing links and admin
// previews via ?org=). Firm domains also serve journeys at /<slug> directly.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JourneyRuntime } from "@/components/runtime/JourneyRuntime";
import { journeyMetadataForOrg } from "@/modules/journeys/og";
import { pickLocale } from "@/modules/journeys/domain/i18n";
import { getPublishedJourneyCached } from "@/server/journeyCache";
import { resolvePublicOrg } from "@/server/tenant";
import { headers } from "next/headers";

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
  const languages = journey.definition.languages ?? ["en"];
  const langParam = ["lang", "hl", "locale"].map((k) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined)).find(Boolean);
  const locale = pickLocale(langParam, (await headers()).get("accept-language"), languages);
  return journeyMetadataForOrg(journey.definition, org, locale);
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
  const org = await resolvePublicOrg(typeof sp.org === "string" ? sp.org : undefined);
  if (!org) notFound();
  return <JourneyRuntime org={org} slug={slug} searchParams={sp} />;
}
