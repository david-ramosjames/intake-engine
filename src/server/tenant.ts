// Server-side tenant resolution for App Router. Reads the hint set by
// middleware, then resolves it to a concrete organization. In DEMO mode (no
// database) it always resolves to the demo organization so the platform is
// navigable out of the box.

import { headers } from "next/headers";
import { getPrisma, hasDatabase } from "./db";
import { DEMO_ORG } from "./demo";

export interface ResolvedTenant {
  organizationId: string;
  organizationName: string;
  slug: string;
}

export async function getCurrentTenant(): Promise<ResolvedTenant | null> {
  const h = await headers();
  const kind = h.get("x-tenant-kind") ?? "platform";
  const slug = h.get("x-tenant-slug") ?? undefined;
  const host = h.get("x-tenant-host") ?? undefined;

  if (!hasDatabase) {
    return { organizationId: DEMO_ORG.id, organizationName: DEMO_ORG.name, slug: DEMO_ORG.slug };
  }

  const prisma = await getPrisma();

  if (kind === "custom" && host) {
    const domain = await prisma.domain.findUnique({ where: { hostname: host }, include: { organization: true } });
    if (domain) {
      return {
        organizationId: domain.organizationId,
        organizationName: domain.organization.name,
        slug: domain.organization.slug,
      };
    }
  }

  if (kind === "subdomain" && slug) {
    const org = await prisma.organization.findUnique({ where: { slug } });
    if (org) return { organizationId: org.id, organizationName: org.name, slug: org.slug };
  }

  return null;
}

/** For the admin, which in this MVP defaults to the first/only org (or demo). */
export async function getAdminTenant(): Promise<ResolvedTenant> {
  const current = await getCurrentTenant();
  if (current) return current;
  if (!hasDatabase) {
    return { organizationId: DEMO_ORG.id, organizationName: DEMO_ORG.name, slug: DEMO_ORG.slug };
  }
  const prisma = await getPrisma();
  const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (org) return { organizationId: org.id, organizationName: org.name, slug: org.slug };
  return { organizationId: DEMO_ORG.id, organizationName: DEMO_ORG.name, slug: DEMO_ORG.slug };
}
