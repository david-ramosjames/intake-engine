// Seeds a first organization (Ramos James Law) with a published Car Accident
// journey — the same definition served in DEMO mode. Run with `npm run db:seed`.
// Idempotent: safe to run repeatedly.

import { PrismaClient } from "@prisma/client";
import { carAccidentJourney } from "../src/modules/journeys/content/pi-car-accident";

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: "ramos-james" },
    update: {},
    create: {
      slug: "ramos-james",
      name: "Ramos James Law, PLLC",
      industry: "legal.personal_injury",
      domains: {
        create: [{ hostname: "intake.ramosjames.com", isPrimary: true }],
      },
      themes: {
        create: [
          {
            name: "Ramos James — Dark",
            isDefault: true,
            tokens: {
              colorBackground: "#0b1f3a",
              colorPrimary: "#ffffff",
              colorAccent: "#e63946",
            },
          },
        ],
      },
    },
  });

  const journey = await prisma.journey.upsert({
    where: { organizationId_slug: { organizationId: org.id, slug: "car-accident" } },
    update: { name: carAccidentJourney.name },
    create: {
      organizationId: org.id,
      slug: "car-accident",
      name: carAccidentJourney.name,
      description: "Google Ads intake for car accident leads.",
      status: "PUBLISHED",
    },
  });

  // Create v1 if the journey has no versions yet.
  const existing = await prisma.journeyVersion.findFirst({
    where: { journeyId: journey.id, version: 1 },
  });

  const version =
    existing ??
    (await prisma.journeyVersion.create({
      data: {
        journeyId: journey.id,
        version: 1,
        label: "Initial import",
        definition: carAccidentJourney as object,
      },
    }));

  await prisma.journey.update({
    where: { id: journey.id },
    data: { publishedVersionId: version.id, status: "PUBLISHED" },
  });

  console.log(`Seeded org "${org.name}" with journey "/j/${journey.slug}" (v${version.version}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
