// PUBLIC runtime tenant resolution. Reads the host hint set by middleware and
// resolves it to an organization: custom white-label domain → subdomain →
// platform. In DEMO mode (no database) the org is resolved from the store,
// optionally hinted by an `?org=<slug>` query param (used by admin previews on
// localhost, where there is no per-org host).

import { headers } from "next/headers";
import { getPrisma, hasDatabase } from "./db";
import { store } from "./store";
import type { StoredOrg } from "./store/types";

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
