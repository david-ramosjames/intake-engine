// DEMO mode data. When DATABASE_URL is unset the platform serves this in-memory
// organization + journey so the runtime is fully explorable with zero infra.
// The exact same definition is written to Postgres by prisma/seed.ts.

import { carAccidentJourney } from "@/modules/journeys/content/pi-car-accident";
import type { JourneyDefinition } from "@/modules/journeys/domain/schema";

export interface LoadedJourney {
  organizationId: string;
  organizationName: string;
  journeyId: string;
  slug: string;
  name: string;
  definition: JourneyDefinition;
}

export const DEMO_ORG = {
  id: "demo-ramos-james",
  slug: "ramos-james",
  name: "Ramos James Law, PLLC",
};

export const demoJourneys: LoadedJourney[] = [
  {
    organizationId: DEMO_ORG.id,
    organizationName: DEMO_ORG.name,
    journeyId: "demo-car-accident",
    slug: "car-accident",
    name: carAccidentJourney.name,
    definition: carAccidentJourney,
  },
];

export function getDemoJourney(slug: string): LoadedJourney | null {
  return demoJourneys.find((j) => j.slug === slug) ?? null;
}
