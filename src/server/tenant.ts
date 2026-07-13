// PUBLIC runtime tenant resolution. Reads the host hint set by middleware and
// resolves it to an organization: custom white-label domain → subdomain →
// platform. In DEMO mode (no database) the org is resolved from the store,
// optionally hinted by an `?org=<slug>` query param (used by admin previews on
// localhost, where there is no per-org host).

import { headers } from "next/headers";
import { getPrisma, hasDatabase } from "./db";
import { store } from "./store";
import type { StoredOrg } from "./store/types";

/**
 * If the current request arrives on a connected custom domain, resolve the
 * organization and the journey slug it should serve (its mapped journey, or the
 * org's first published journey). Works in both DEMO and DB modes — the host
 * hint is set by middleware for every request.
 */
export async function resolveCustomDomain(): Promise<{ org: StoredOrg; journeySlug: string | null } | null> {
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
}

export async function resolvePublicOrg(orgParam?: string): Promise<StoredOrg | null> {
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
}
