import type { Metadata } from "next";
import Link from "next/link";
import { CallRailScript } from "@/components/runtime/CallRailScript";
import { GoogleTagManager } from "@/components/runtime/GoogleTagManager";
import { JourneyPlayer } from "@/components/runtime/JourneyPlayer";
import { localeFromParam } from "@/modules/journeys/domain/i18n";
import { journeyMetadata, preloadHero } from "@/modules/journeys/og";
import { getAdminOrg } from "@/server/currentOrg";
import { getPublishedJourneyCached } from "@/server/journeyCache";
import { store } from "@/server/store";
import { getPublicSiteConfig, resolveCustomDomain } from "@/server/tenant";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  // On a connected custom domain, the link preview is about that firm/journey.
  const custom = await resolveCustomDomain();
  if (custom?.journeySlug) {
    const journey = await getPublishedJourneyCached(custom.org.id, custom.journeySlug);
    if (journey && journey.status === "PUBLISHED") {
      return journeyMetadata(journey.definition, custom.org.name);
    }
  }
  return {};
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // On a connected custom domain, the root serves that domain's journey.
  const custom = await resolveCustomDomain();
  if (custom?.journeySlug) {
    const journey = await getPublishedJourneyCached(custom.org.id, custom.journeySlug);
    if (journey && journey.status === "PUBLISHED") {
      preloadHero(journey.definition);
      const sp = await searchParams;
      const pick = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
      const attribution: Record<string, string> = { org: custom.org.slug, firm: custom.org.name };
      const source = pick("utm_source") ?? pick("source");
      const campaign = pick("utm_campaign") ?? pick("campaign");
      const medium = pick("utm_medium") ?? pick("medium");
      if (source) attribution.source = source;
      if (campaign) attribution.campaign = campaign;
      if (medium) attribution.medium = medium;
      const { gtmId, callRailSwapUrl } = await getPublicSiteConfig(custom.org.id);
      const initialLocale = localeFromParam(
        pick("lang") ?? pick("hl") ?? pick("locale"),
        journey.definition.languages ?? ["en"],
      );
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
  }

  const org = await getAdminOrg();
  const journeys = org ? await store.listJourneys(org.id) : [];

  return (
    <main className="mx-auto max-w-4xl px-6 py-24">
      <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/60">
        Customer Journey Platform · v0.1
      </span>
      <h1 className="mt-6 text-5xl font-semibold tracking-tight">Intake Engine</h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/60">
        A configurable, multi-tenant platform to acquire, qualify, and convert customers across any
        industry. The universal object is a <span className="text-white">Journey</span> — not a form.
        Legal is simply the first vertical; a dentist or a roofer works tomorrow through configuration,
        not code.
      </p>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/admin"
          className="rounded-full bg-white px-6 py-3 font-medium text-black transition hover:opacity-90 focus-ring"
        >
          Open Admin
        </Link>
        {journeys[0] && org && (
          <Link
            href={`/j/${journeys[0].slug}?org=${org.slug}&utm_source=demo`}
            className="rounded-full border border-white/20 px-6 py-3 font-medium text-white transition hover:bg-white/5 focus-ring"
          >
            Try the live intake →
          </Link>
        )}
      </div>

      <div className="mt-16 grid gap-4 sm:grid-cols-3">
        {[
          ["Journey Builder", "Visual, versioned, A/B-testable experiences."],
          ["Rules Engine", "Data-driven branching, scoring & qualification."],
          ["Automation & AI", "Route, notify, and enrich every lead."],
        ].map(([title, body]) => (
          <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h3 className="font-medium">{title}</h3>
            <p className="mt-1 text-sm text-white/50">{body}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
