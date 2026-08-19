// Prisma/Postgres implementation of the PlatformStore. Used whenever
// DATABASE_URL is set. Mirrors the DEMO store's behavior against the real
// normalized schema (organizations, journeys + versions, leads + answers +
// events).

import { safeParseJourneyDefinition, type JourneyDefinition } from "@/modules/journeys/domain/schema";
import { getPrisma } from "../db";
import {
  normalizeHostname,
  type AutomationAction,
  type CreateAutomationInput,
  type CreateDomainInput,
  type CreateJourneyInput,
  type CreateLeadInput,
  type CreateOrgInput,
  type PlatformStore,
  type UpdateLeadInput,
  type StoredAutomation,
  type StoredDomain,
  type StoredEvent,
  type StoredJourney,
  type StoredLead,
  type StoredOrg,
} from "./types";

function domainRow(d: any): StoredDomain {
  return {
    id: d.id,
    organizationId: d.organizationId,
    journeyId: d.journeyId ?? undefined,
    hostname: d.hostname,
    verifiedAt: d.verifiedAt?.toISOString?.() ?? (d.verifiedAt ? String(d.verifiedAt) : undefined),
    createdAt: d.createdAt?.toISOString?.() ?? String(d.createdAt),
  };
}

function automationRow(a: any): StoredAutomation {
  return {
    id: a.id,
    organizationId: a.organizationId,
    journeyId: a.journeyId ?? undefined,
    name: a.name,
    enabled: a.enabled,
    trigger: (a.trigger ?? { event: "LEAD_COMPLETED" }) as { event: string },
    actions: (Array.isArray(a.actions) ? a.actions : []) as AutomationAction[],
    createdAt: a.createdAt?.toISOString?.() ?? String(a.createdAt),
    updatedAt: a.updatedAt?.toISOString?.() ?? String(a.updatedAt),
  };
}

function orgRow(o: any): StoredOrg {
  return { id: o.id, slug: o.slug, name: o.name, industry: o.industry ?? undefined, createdAt: o.createdAt?.toISOString?.() ?? String(o.createdAt) };
}

function leadRow(l: any): StoredLead {
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
    context: (l.context as Record<string, string>) ?? {},
    source: l.source ?? undefined,
    campaign: l.campaign ?? undefined,
    medium: l.medium ?? undefined,
    createdAt: l.createdAt?.toISOString?.() ?? String(l.createdAt),
  };
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

  async getOrgSettings(orgId) {
    const prisma = await getPrisma();
    const o = await prisma.organization.findUnique({ where: { id: orgId } });
    const settings = o?.settings;
    return settings && typeof settings === "object" ? (settings as Record<string, unknown>) : {};
  },

  async saveOrgSettings(orgId, settings) {
    const prisma = await getPrisma();
    await prisma.organization.update({ where: { id: orgId }, data: { settings } });
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

    if (input.slug && input.slug !== journey.slug) {
      const clash = await prisma.journey.findFirst({
        where: { organizationId: orgId, slug: input.slug, NOT: { id: journey.id } },
      });
      if (clash) throw new Error("That URL path is already used by another journey.");
    }

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
        slug: input.slug ?? journey.slug,
        publishedVersionId: version.id,
        status: "PUBLISHED",
      },
    });
    return journeyRow(updated, input.definition);
  },

  async duplicateJourney(orgId, slug) {
    const src = await this.getJourney(orgId, slug);
    if (!src) throw new Error("Journey not found.");
    const prisma = await getPrisma();
    let newSlug = `${slug}-copy`;
    let n = 2;
    while (await prisma.journey.findFirst({ where: { organizationId: orgId, slug: newSlug } })) {
      newSlug = `${slug}-copy-${n++}`;
    }
    return this.createJourney(orgId, {
      name: `${src.name} (copy)`,
      slug: newSlug,
      description: src.description,
      definition: src.definition,
    });
  },

  async deleteJourney(orgId, slug) {
    const prisma = await getPrisma();
    const j = await prisma.journey.findFirst({ where: { organizationId: orgId, slug } });
    if (!j) return;
    // Detach any custom domains pointing here so they fall back to the org's
    // default journey instead of a dangling reference.
    await (prisma.domain as any).updateMany({
      where: { organizationId: orgId, journeyId: j.id },
      data: { journeyId: null },
    });
    // Leads have a required journey FK with no cascade, so remove them first
    // (their answer/event/tag children cascade from the lead).
    await (prisma.lead as any).deleteMany({ where: { organizationId: orgId, journeyId: j.id } });
    // Break the published-version pointer, then delete — versions, experiments
    // and automations cascade from the journey.
    await (prisma.journey as any).update({ where: { id: j.id }, data: { publishedVersionId: null } });
    await (prisma.journey as any).delete({ where: { id: j.id } });
  },

  async listLeads(orgId) {
    const prisma = await getPrisma();
    const rows = await prisma.lead.findMany({
      where: { organizationId: orgId },
      include: { journey: true },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(leadRow);
  },

  async getLead(orgId, id) {
    const prisma = await getPrisma();
    const l = await prisma.lead.findFirst({ where: { id, organizationId: orgId }, include: { journey: true } });
    return l ? leadRow(l) : null;
  },

  async deleteLead(orgId, id) {
    const prisma = await getPrisma();
    // Scope the delete to the org (deleteMany avoids throwing when not found).
    await (prisma.lead as any).deleteMany({ where: { id, organizationId: orgId } });
  },

  async recordEvent(input) {
    const prisma = await getPrisma();
    await (prisma as any).journeyEvent.create({
      data: {
        organizationId: input.orgId,
        journeySlug: input.journeySlug,
        sessionId: input.sessionId,
        type: input.type.toUpperCase(),
        outcome: input.outcome,
        source: input.source,
        pageUrl: input.pageUrl,
      },
    });
  },

  async listEvents(orgId, sinceISO) {
    const prisma = await getPrisma();
    const rows = await (prisma as any).journeyEvent.findMany({
      where: { organizationId: orgId, ...(sinceISO ? { createdAt: { gte: new Date(sinceISO) } } : {}) },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(
      (e: any): StoredEvent => ({
        id: e.id,
        orgId: e.organizationId,
        journeySlug: e.journeySlug ?? undefined,
        sessionId: e.sessionId,
        type: String(e.type).toLowerCase() as StoredEvent["type"],
        outcome: (e.outcome ?? undefined) as StoredEvent["outcome"],
        source: e.source ?? undefined,
        pageUrl: e.pageUrl ?? undefined,
        createdAt: e.createdAt?.toISOString?.() ?? String(e.createdAt),
      }),
    );
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
        context: (input.context ?? {}) as object,
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
      context: input.context ?? {},
      source: input.source,
      campaign: input.campaign,
      medium: input.medium,
      createdAt: new Date().toISOString(),
    };
  },

  async updateLead(orgId: string, id: string, input: UpdateLeadInput) {
    const prisma = await getPrisma();
    // Scope to the org so one tenant can't enrich another's lead.
    const existing = await prisma.lead.findFirst({ where: { id, organizationId: orgId } });
    if (!existing) return null;
    const data: Record<string, unknown> = { answers: input.answers as object };
    if (input.score !== undefined) data.score = input.score;
    if (input.displayName !== undefined) data.displayName = input.displayName;
    if (input.email !== undefined) data.email = input.email;
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.context !== undefined) data.context = input.context as object;
    if (input.outcome !== undefined) {
      data.status =
        input.outcome === "referral" ? "REFERRED" : input.outcome === "declined" ? "DISQUALIFIED" : "QUALIFIED";
      data.qualified = input.outcome === "lead";
      data.referral = input.outcome === "referral";
    }
    const lead = await prisma.lead.update({
      where: { id: existing.id },
      data,
      include: { journey: true },
    });
    return leadRow(lead);
  },

  async listDomains(orgId) {
    const prisma = await getPrisma();
    const rows = await prisma.domain.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(domainRow);
  },

  async addDomain(input: CreateDomainInput) {
    const prisma = await getPrisma();
    const hostname = normalizeHostname(input.hostname);
    if (!hostname) throw new Error("Enter a valid domain, e.g. intake.yourfirm.com");
    const existing = await prisma.domain.findUnique({ where: { hostname } });
    if (existing) throw new Error(`The domain "${hostname}" is already connected.`);
    const row = await prisma.domain.create({
      data: { organizationId: input.organizationId, journeyId: input.journeyId ?? null, hostname },
    });
    return domainRow(row);
  },

  async deleteDomain(orgId, id) {
    const prisma = await getPrisma();
    await prisma.domain.deleteMany({ where: { id, organizationId: orgId } });
  },

  async getDomainByHost(hostname) {
    const prisma = await getPrisma();
    const row = await prisma.domain.findUnique({ where: { hostname: normalizeHostname(hostname) } });
    return row ? domainRow(row) : null;
  },

  async listAutomations(orgId) {
    const prisma = await getPrisma();
    const rows = await prisma.automation.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(automationRow);
  },

  async createAutomation(input: CreateAutomationInput) {
    const prisma = await getPrisma();
    const row = await prisma.automation.create({
      data: {
        organizationId: input.organizationId,
        journeyId: input.journeyId ?? null,
        name: input.name,
        enabled: input.enabled ?? true,
        trigger: input.trigger,
        actions: input.actions,
      },
    });
    return automationRow(row);
  },

  async updateAutomation(orgId, id, input) {
    const prisma = await getPrisma();
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.enabled !== undefined) data.enabled = input.enabled;
    if (input.journeyId !== undefined) data.journeyId = input.journeyId ?? null;
    if (input.trigger !== undefined) data.trigger = input.trigger;
    if (input.actions !== undefined) data.actions = input.actions;
    await prisma.automation.updateMany({ where: { id, organizationId: orgId }, data });
    const row = await prisma.automation.findFirst({ where: { id, organizationId: orgId } });
    if (!row) throw new Error("Automation not found.");
    return automationRow(row);
  },

  async deleteAutomation(orgId, id) {
    const prisma = await getPrisma();
    await prisma.automation.deleteMany({ where: { id, organizationId: orgId } });
  },
};
