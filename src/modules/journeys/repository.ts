// Journey data access. Reads the published version of a journey and returns a
// normalized `LoadedJourney`. Falls back to DEMO mode when no database is
// configured so the runtime works out of the box.

import { getPrisma, hasDatabase } from "@/server/db";
import { demoJourneys, getDemoJourney, type LoadedJourney } from "@/server/demo";
import { safeParseJourneyDefinition } from "./domain/schema";

export async function listJourneysForOrg(organizationId: string): Promise<LoadedJourney[]> {
  if (!hasDatabase) return demoJourneys.filter((j) => j.organizationId === organizationId);

  const prisma = await getPrisma();
  const rows = await prisma.journey.findMany({
    where: { organizationId },
    include: { organization: true, published: true },
    orderBy: { updatedAt: "desc" },
  });

  const out: LoadedJourney[] = [];
  for (const j of rows) {
    if (!j.published) continue;
    const parsed = safeParseJourneyDefinition(j.published.definition);
    if (!parsed.success) continue;
    out.push({
      organizationId: j.organizationId,
      organizationName: j.organization.name,
      journeyId: j.id,
      slug: j.slug,
      name: j.name,
      definition: parsed.data,
    });
  }
  return out;
}

export async function loadPublishedJourney(
  organizationId: string,
  slug: string,
): Promise<LoadedJourney | null> {
  if (!hasDatabase) {
    const demo = getDemoJourney(slug);
    return demo && demo.organizationId === organizationId ? demo : null;
  }

  const prisma = await getPrisma();
  const j = await prisma.journey.findFirst({
    where: { organizationId, slug },
    include: { organization: true, published: true },
  });
  if (!j || !j.published) return null;

  const parsed = safeParseJourneyDefinition(j.published.definition);
  if (!parsed.success) return null;

  return {
    organizationId: j.organizationId,
    organizationName: j.organization.name,
    journeyId: j.id,
    slug: j.slug,
    name: j.name,
    definition: parsed.data,
  };
}
