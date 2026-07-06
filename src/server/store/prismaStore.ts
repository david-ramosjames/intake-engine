// Prisma/Postgres implementation of the PlatformStore. Used whenever
// DATABASE_URL is set. Mirrors the DEMO store's behavior against the real
// normalized schema (organizations, journeys + versions, leads + answers +
// events).

import { safeParseJourneyDefinition, type JourneyDefinition } from "@/modules/journeys/domain/schema";
import { getPrisma } from "../db";
import type {
  CreateJourneyInput,
  CreateLeadInput,
  CreateOrgInput,
  PlatformStore,
  StoredJourney,
  StoredLead,
  StoredOrg,
} from "./types";

function orgRow(o: any): StoredOrg {
  return { id: o.id, slug: o.slug, name: o.name, industry: o.industry ?? undefined, createdAt: o.createdAt?.toISOString?.() ?? String(o.createdAt) };
}

function journeyRow(j: any, def: JourneyDefinition): StoredJourney {
  return {
    id: j.id,
    orgId: j.organizationId,
    slug: j.slug,
    name: j.name,
    description: j.description ?? undefined,
    status: j.status,
    definition: def,
    createdAt: j.createdAt?.toISOString?.() ?? String(j.createdAt),
    updatedAt: j.updatedAt?.toISOString?.() ?? String(j.updatedAt),
  };
}

export const prismaStore: PlatformStore = {
  async listOrganizations() {
    const prisma = await getPrisma();
    const rows = await prisma.organization.findMany({ orderBy: { createdAt: "asc" } });
    return rows.map(orgRow);
  },

  async getOrganization(id) {
    const prisma = await getPrisma();
    const o = await prisma.organization.findUnique({ where: { id } });
    return o ? orgRow(o) : null;
  },

  async getOrganizationBySlug(slug) {
    const prisma = await getPrisma();
    const o = await prisma.organization.findUnique({ where: { slug } });
    return o ? orgRow(o) : null;
  },

  async createOrganization(input: CreateOrgInput) {
    const prisma = await getPrisma();
    const o = await prisma.organization.create({
      data: { slug: input.slug, name: input.name, industry: input.industry },
    });
    return orgRow(o);
  },

  async listJourneys(orgId) {
    const prisma = await getPrisma();
    const rows = await prisma.journey.findMany({
      where: { organizationId: orgId },
      include: { published: true },
      orderBy: { updatedAt: "desc" },
    });
    const out: StoredJourney[] = [];
    for (const j of rows) {
      const parsed = j.published ? safeParseJourneyDefinition(j.published.definition) : null;
      if (parsed?.success) out.push(journeyRow(j, parsed.data));
    }
    return out;
  },

  async getJourney(orgId, slug) {
    const prisma = await getPrisma();
    const j = await prisma.journey.findFirst({
      where: { organizationId: orgId, slug },
      include: { published: true },
    });
    if (!j || !j.published) return null;
    const parsed = safeParseJourneyDefinition(j.published.definition);
    return parsed.success ? journeyRow(j, parsed.data) : null;
  },

  async createJourney(orgId, input: CreateJourneyInput) {
    const prisma = await getPrisma();
    const journey = await prisma.journey.create({
      data: {
        organizationId: orgId,
        slug: input.slug,
        name: input.name,
        description: input.description,
        status: "PUBLISHED",
      },
    });
    const version = await prisma.journeyVersion.create({
      data: { journeyId: journey.id, version: 1, label: "Initial", definition: input.definition as object },
    });
    const updated = await prisma.journey.update({
      where: { id: journey.id },
      data: { publishedVersionId: version.id },
    });
    return journeyRow(updated, input.definition);
  },

  async updateJourney(orgId, slug, input) {
    const prisma = await getPrisma();
    const journey = await prisma.journey.findFirst({ where: { organizationId: orgId, slug } });
    if (!journey) throw new Error("Journey not found.");

    // Editing never mutates a published version — create the next version and
    // pin it as published.
    const latest = await prisma.journeyVersion.findFirst({
      where: { journeyId: journey.id },
      orderBy: { version: "desc" },
    });
    const nextVersion = (latest?.version ?? 0) + 1;
    const version = await prisma.journeyVersion.create({
      data: {
        journeyId: journey.id,
        version: nextVersion,
        label: "Edit",
        definition: input.definition as object,
      },
    });
    const updated = await prisma.journey.update({
      where: { id: journey.id },
      data: {
        name: input.name ?? journey.name,
        description: input.description ?? journey.description,
        publishedVersionId: version.id,
        status: "PUBLISHED",
      },
    });
    return journeyRow(updated, input.definition);
  },

  async listLeads(orgId) {
    const prisma = await getPrisma();
    const rows = await prisma.lead.findMany({
      where: { organizationId: orgId },
      include: { journey: true },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((l: any): StoredLead => {
      const status: StoredLead["status"] =
        l.status === "REFERRED" ? "REFERRED" : l.status === "QUALIFIED" ? "QUALIFIED" : "DISQUALIFIED";
      const outcome = status === "REFERRED" ? "referral" : status === "QUALIFIED" ? "lead" : "declined";
      return {
        id: l.id,
        orgId: l.organizationId,
        journeyId: l.journeyId,
        journeySlug: l.journey?.slug ?? "",
        status,
        outcome,
        displayName: l.displayName ?? undefined,
        email: l.email ?? undefined,
        phone: l.phone ?? undefined,
        score: l.score ?? 0,
        qualified: Boolean(l.qualified),
        referral: Boolean(l.referral),
        answers: (l.answers as Record<string, unknown>) ?? {},
        source: l.source ?? undefined,
        campaign: l.campaign ?? undefined,
        medium: l.medium ?? undefined,
        createdAt: l.createdAt?.toISOString?.() ?? String(l.createdAt),
      };
    });
  },

  async createLead(input: CreateLeadInput) {
    const prisma = await getPrisma();
    const status =
      input.outcome === "referral" ? "REFERRED" : input.outcome === "declined" ? "DISQUALIFIED" : "QUALIFIED";
    const lead = await prisma.lead.create({
      data: {
        organizationId: input.orgId,
        journeyId: input.journeyId,
        status,
        displayName: input.displayName,
        email: input.email,
        phone: input.phone,
        score: input.score,
        qualified: input.qualified,
        referral: input.referral,
        answers: input.answers as object,
        source: input.source,
        campaign: input.campaign,
        medium: input.medium,
        completedAt: new Date(),
        events: {
          create: [
            { type: "COMPLETED", payload: {} },
            { type: "SCORED", payload: { score: input.score } },
            { type: status === "REFERRED" ? "STATUS_CHANGED" : input.qualified ? "QUALIFIED" : "DISQUALIFIED", payload: { status } },
          ],
        },
      },
    });
    return {
      id: lead.id,
      orgId: input.orgId,
      journeyId: input.journeyId,
      journeySlug: input.journeySlug,
      status,
      outcome: input.outcome,
      displayName: input.displayName,
      email: input.email,
      phone: input.phone,
      score: input.score,
      qualified: input.qualified,
      referral: input.referral,
      answers: input.answers,
      source: input.source,
      campaign: input.campaign,
      medium: input.medium,
      createdAt: new Date().toISOString(),
    };
  },
};
