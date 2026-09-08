// Firm-path journey route: on a firm's domain, each journey is served at its own
// path, e.g. start.ramosjames.com/car -> the "car" journey for that org. Static
// routes (/admin, /api, /j, /login) take priority over this dynamic segment, so
// only real journey paths reach here. Spanish works the same as elsewhere:
// /car?lang=es, or automatically for Spanish-preferring browsers.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JourneyRuntime } from "@/components/runtime/JourneyRuntime";
import { journeyMetadataForOrg } from "@/modules/journeys/og";
import { pickLocale } from "@/modules/journeys/domain/i18n";
import { getPublishedJourneyCached } from "@/server/journeyCache";
import { resolvePublicOrg } from "@/server/tenant";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

// Never treat framework/app paths as journey slugs.
const RESERVED = new Set(["admin", "api", "j", "login", "favicon.ico", "robots.txt", "sitemap.xml", "_next"]);

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (RESERVED.has(slug)) return {};
  const sp = await searchParams;
  const org = await resolvePublicOrg(typeof sp.org === "string" ? sp.org : undefined);
  if (!org) return {};
  const journey = await getPublishedJourneyCached(org.id, slug);
  if (!journey || journey.status !== "PUBLISHED") return {};
  const languages = journey.definition.languages ?? ["en"];
  const langParam = ["lang", "hl", "locale"].map((k) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined)).find(Boolean);
  const locale = pickLocale(langParam, (await headers()).get("accept-language"), languages);
  return journeyMetadataForOrg(journey.definition, org, locale);
}

export default async function FirmPathJourneyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  if (RESERVED.has(slug)) notFound();
  const sp = await searchParams;
  const org = await resolvePublicOrg(typeof sp.org === "string" ? sp.org : undefined);
  if (!org) notFound();
  return <JourneyRuntime org={org} slug={slug} searchParams={sp} />;
}
