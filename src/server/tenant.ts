// PUBLIC runtime tenant resolution. Reads the host hint set by middleware and
// resolves it to an organization: custom white-label domain → subdomain →
// platform. In DEMO mode (no database) the org is resolved from the store,
// optionally hinted by an `?org=<slug>` query param (used by admin previews on
// localhost, where there is no per-org host).

import { cache } from "react";
import { headers } from "next/headers";
import { callRailConfig, callRailSwapScriptUrl } from "@/modules/integrations/callrail";
import { openaiAdsConfig, sanitizePixelId } from "@/modules/integrations/openaiAds";
import { readBusinessPhone } from "@/modules/settings/businessPhone";
import { getPrisma, hasDatabase } from "./db";
import { store } from "./store";
import type { StoredOrg } from "./store/types";

/**
 * If the current request arrives on a connected custom domain, resolve the
 * organization and the journey slug it should serve (its mapped journey, or the
 * org's first published journey). Works in both DEMO and DB modes — the host
 * hint is set by middleware for every request.
 */
// Wrapped in React cache() so the tenant lookup runs once per request even
// though it's called from both generateMetadata and the page render.
export const resolveCustomDomain = cache(async function resolveCustomDomain(): Promise<{
  org: StoredOrg;
  journeySlug: string | null;
} | null> {
  const h = await headers();
  const kind = h.get("x-tenant-kind");
  const host = h.get("x-tenant-host") ?? undefined;
  if (kind !== "custom" || !host) return null;

  const domain = await store.getDomainByHost(host);
  if (!domain) return null;
  const org = await store.getOrganization(domain.organizationId);
  if (!org) return null;

  const journeys = await store.listJourneys(org.id);
  const published = journeys.filter((j) => j.status === "PUBLISHED");
  const mapped = domain.journeyId ? published.find((j) => j.id === domain.journeyId) : undefined;
  const journeySlug = (mapped ?? published[0])?.slug ?? null;
  return { org, journeySlug };
});

// Non-secret, public-safe org config for the runtime (e.g. the GTM container
// id). Deliberately excludes credentials in the settings blob. Cached per
// request so the page render doesn't add an extra round-trip.
export const getPublicSiteConfig = cache(async function getPublicSiteConfig(
  orgId: string,
): Promise<{ gtmId?: string; callRailSwapUrl?: string; phone?: string; openaiPixelId?: string }> {
  const settings = await store.getOrgSettings(orgId);
  const gtm = settings.gtm as { containerId?: string } | undefined;
  const gtmId = gtm?.containerId?.trim();
  const callRailSwapUrl = callRailSwapScriptUrl(callRailConfig(settings));
  const phone = readBusinessPhone(settings);
  const openaiPixelId = sanitizePixelId(openaiAdsConfig(settings)?.pixelId);
  return {
    gtmId: gtmId || undefined,
    callRailSwapUrl,
    phone: phone || undefined,
    openaiPixelId,
  };
});

export const resolvePublicOrg = cache(async function resolvePublicOrg(
  orgParam?: string,
): Promise<StoredOrg | null> {
  if (!hasDatabase) {
    if (orgParam) {
      const bySlug = await store.getOrganizationBySlug(orgParam);
      if (bySlug) return bySlug;
    }
    const orgs = await store.listOrganizations();
    return orgs[0] ?? null;
  }

  const h = await headers();
  const kind = h.get("x-tenant-kind") ?? "platform";
  const slug = h.get("x-tenant-slug") ?? undefined;
  const host = h.get("x-tenant-host") ?? undefined;
  const prisma = await getPrisma();

  if (kind === "custom" && host) {
    const domain = await prisma.domain.findUnique({ where: { hostname: host } });
    if (domain) return store.getOrganization(domain.organizationId);
  }
  if (kind === "subdomain" && slug) {
    return store.getOrganizationBySlug(slug);
  }
  // Fall back to org param (e.g. previews) even with a DB.
  if (orgParam) return store.getOrganizationBySlug(orgParam);
  return null;
});
