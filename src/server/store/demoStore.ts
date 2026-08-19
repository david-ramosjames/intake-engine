// File-backed DEMO store. When no DATABASE_URL is configured, the platform uses
// this so that creating organizations, journeys, and capturing leads all work
// and PERSIST across dev restarts (written to ./.data/store.json). It is not a
// production persistence path — the Prisma store is. Concurrency is naive (fine
// for local development).

import { promises as fs } from "node:fs";
import path from "node:path";
import { carAccidentJourney } from "@/modules/journeys/content/pi-car-accident";
import {
  newId,
  normalizeHostname,
  type CreateAutomationInput,
  type CreateDomainInput,
  type CreateJourneyInput,
  type CreateLeadInput,
  type CreateOrgInput,
  type PlatformStore,
  type UpdateLeadInput,
  type RecordEventInput,
  type StoredAutomation,
  type StoredDomain,
  type StoredEvent,
  type UpdateAutomationInput,
  type UpdateJourneyInput,
  type StoredJourney,
  type StoredLead,
  type StoredOrg,
} from "./types";

interface Db {
  organizations: StoredOrg[];
  journeys: StoredJourney[];
  leads: StoredLead[];
  events: StoredEvent[];
  domains: StoredDomain[];
  automations: StoredAutomation[];
}

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "store.json");

let cache: Db | null = null;

function seed(): Db {
  const now = new Date().toISOString();
  const org: StoredOrg = {
    id: "org_ramos_james",
    slug: "ramos-james",
    name: "Ramos James Law, PLLC",
    industry: "legal.personal_injury",
    createdAt: now,
  };
  const journey: StoredJourney = {
    id: "jny_car_accident",
    orgId: org.id,
    slug: "car-accident",
    name: carAccidentJourney.name,
    description: "Google Ads intake for car accident leads.",
    status: "PUBLISHED",
    definition: carAccidentJourney,
    createdAt: now,
    updatedAt: now,
  };
  return { organizations: [org], journeys: [journey], leads: [], events: [], domains: [], automations: [] };
}

async function load(): Promise<Db> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    cache = JSON.parse(raw) as Db;
    cache.events ??= []; // back-compat for stores created before events
    cache.domains ??= []; // back-compat for stores created before domains
    cache.automations ??= []; // back-compat for stores created before automations
  } catch {
    cache = seed();
    await persist();
  }
  return cache;
}

async function persist(): Promise<void> {
  if (!cache) return;
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(cache, null, 2), "utf8");
}

export const demoStore: PlatformStore = {
  async listOrganizations() {
    const db = await load();
    return [...db.organizations].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async getOrganization(id) {
    const db = await load();
    return db.organizations.find((o) => o.id === id) ?? null;
  },

  async getOrganizationBySlug(slug) {
    const db = await load();
    return db.organizations.find((o) => o.slug === slug) ?? null;
  },

  async getOrgSettings(orgId) {
    const db = await load();
    return db.organizations.find((o) => o.id === orgId)?.settings ?? {};
  },

  async saveOrgSettings(orgId, settings) {
    const db = await load();
    const org = db.organizations.find((o) => o.id === orgId);
    if (!org) throw new Error("Organization not found.");
    org.settings = settings;
    await persist();
  },

  async createOrganization(input: CreateOrgInput) {
    const db = await load();
    if (db.organizations.some((o) => o.slug === input.slug)) {
      throw new Error(`An organization with the slug "${input.slug}" already exists.`);
    }
    const org: StoredOrg = {
      id: newId("org"),
      slug: input.slug,
      name: input.name,
      industry: input.industry,
      createdAt: new Date().toISOString(),
    };
    db.organizations.push(org);
    await persist();
    return org;
  },

  async listJourneys(orgId) {
    const db = await load();
    return db.journeys
      .filter((j) => j.orgId === orgId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async getJourney(orgId, slug) {
    const db = await load();
    return db.journeys.find((j) => j.orgId === orgId && j.slug === slug) ?? null;
  },

  async createJourney(orgId, input: CreateJourneyInput) {
    const db = await load();
    if (db.journeys.some((j) => j.orgId === orgId && j.slug === input.slug)) {
      throw new Error(`A journey with the slug "${input.slug}" already exists in this organization.`);
    }
    const now = new Date().toISOString();
    const journey: StoredJourney = {
      id: newId("jny"),
      orgId,
      slug: input.slug,
      name: input.name,
      description: input.description,
      status: "PUBLISHED", // demo publishes immediately so it's previewable
      definition: input.definition,
      createdAt: now,
      updatedAt: now,
    };
    db.journeys.push(journey);
    await persist();
    return journey;
  },

  async updateJourney(orgId, slug, input: UpdateJourneyInput) {
    const db = await load();
    const journey = db.journeys.find((j) => j.orgId === orgId && j.slug === slug);
    if (!journey) throw new Error("Journey not found.");
    if (input.slug !== undefined && input.slug !== journey.slug) {
      if (db.journeys.some((j) => j.orgId === orgId && j.slug === input.slug && j.id !== journey.id)) {
        throw new Error("That URL path is already used by another journey.");
      }
      journey.slug = input.slug;
    }
    if (input.name !== undefined) journey.name = input.name;
    if (input.description !== undefined) journey.description = input.description;
    journey.definition = input.definition;
    journey.updatedAt = new Date().toISOString();
    await persist();
    return journey;
  },

  async duplicateJourney(orgId, slug) {
    const db = await load();
    const src = db.journeys.find((j) => j.orgId === orgId && j.slug === slug);
    if (!src) throw new Error("Journey not found.");
    let newSlug = `${src.slug}-copy`;
    let n = 2;
    while (db.journeys.some((j) => j.orgId === orgId && j.slug === newSlug)) newSlug = `${src.slug}-copy-${n++}`;
    const now = new Date().toISOString();
    const copy: StoredJourney = {
      id: newId("jny"),
      orgId,
      slug: newSlug,
      name: `${src.name} (copy)`,
      description: src.description,
      status: "PUBLISHED",
      definition: JSON.parse(JSON.stringify(src.definition)),
      createdAt: now,
      updatedAt: now,
    };
    db.journeys.push(copy);
    await persist();
    return copy;
  },

  async deleteJourney(orgId, slug) {
    const db = await load();
    const idx = db.journeys.findIndex((j) => j.orgId === orgId && j.slug === slug);
    if (idx === -1) return;
    const [removed] = db.journeys.splice(idx, 1);
    if (removed) {
      // Remove leads captured by this journey (matches the Prisma path, where
      // the lead→journey FK would otherwise block the delete).
      db.leads = db.leads.filter((l) => !(l.orgId === orgId && l.journeyId === removed.id));
      // Detach any custom domains that pointed here so they fall back to the
      // org's default journey instead of a dangling reference.
      for (const d of db.domains) {
        if (d.organizationId === orgId && d.journeyId === removed.id) d.journeyId = undefined;
      }
    }
    await persist();
  },

  async listLeads(orgId) {
    const db = await load();
    return db.leads
      .filter((l) => l.orgId === orgId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async getLead(orgId, id) {
    const db = await load();
    return db.leads.find((l) => l.orgId === orgId && l.id === id) ?? null;
  },

  async deleteLead(orgId, id) {
    const db = await load();
    const idx = db.leads.findIndex((l) => l.orgId === orgId && l.id === id);
    if (idx !== -1) {
      db.leads.splice(idx, 1);
      await persist();
    }
  },

  async recordEvent(input: RecordEventInput) {
    const db = await load();
    db.events.push({ id: newId("evt"), createdAt: new Date().toISOString(), ...input });
    await persist();
  },

  async listEvents(orgId, sinceISO) {
    const db = await load();
    return db.events.filter((e) => e.orgId === orgId && (!sinceISO || e.createdAt >= sinceISO));
  },

  async createLead(input: CreateLeadInput) {
    const db = await load();
    const status =
      input.outcome === "referral" ? "REFERRED" : input.outcome === "declined" ? "DISQUALIFIED" : "QUALIFIED";
    const lead: StoredLead = {
      id: newId("lead"),
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
    db.leads.push(lead);
    await persist();
    return lead;
  },

  async updateLead(orgId: string, id: string, input: UpdateLeadInput) {
    const db = await load();
    const lead = db.leads.find((l) => l.orgId === orgId && l.id === id);
    if (!lead) return null;
    lead.answers = input.answers;
    if (input.score !== undefined) lead.score = input.score;
    if (input.displayName !== undefined) lead.displayName = input.displayName;
    if (input.email !== undefined) lead.email = input.email;
    if (input.phone !== undefined) lead.phone = input.phone;
    if (input.context !== undefined) lead.context = input.context;
    if (input.outcome !== undefined) {
      lead.outcome = input.outcome;
      lead.status =
        input.outcome === "referral" ? "REFERRED" : input.outcome === "declined" ? "DISQUALIFIED" : "QUALIFIED";
      lead.qualified = input.outcome === "lead";
      lead.referral = input.outcome === "referral";
    }
    await persist();
    return lead;
  },

  async listDomains(orgId) {
    const db = await load();
    return db.domains
      .filter((d) => d.organizationId === orgId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async addDomain(input: CreateDomainInput) {
    const db = await load();
    const hostname = normalizeHostname(input.hostname);
    if (!hostname) throw new Error("Enter a valid domain, e.g. intake.yourfirm.com");
    if (db.domains.some((d) => d.hostname === hostname)) {
      throw new Error(`The domain "${hostname}" is already connected.`);
    }
    const domain: StoredDomain = {
      id: newId("dom"),
      organizationId: input.organizationId,
      journeyId: input.journeyId,
      hostname,
      createdAt: new Date().toISOString(),
    };
    db.domains.push(domain);
    await persist();
    return domain;
  },

  async deleteDomain(orgId, id) {
    const db = await load();
    db.domains = db.domains.filter((d) => !(d.id === id && d.organizationId === orgId));
    await persist();
  },

  async getDomainByHost(hostname) {
    const db = await load();
    const host = normalizeHostname(hostname);
    return db.domains.find((d) => d.hostname === host) ?? null;
  },

  async listAutomations(orgId) {
    const db = await load();
    return db.automations
      .filter((a) => a.organizationId === orgId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async createAutomation(input: CreateAutomationInput) {
    const db = await load();
    const now = new Date().toISOString();
    const automation: StoredAutomation = {
      id: newId("auto"),
      organizationId: input.organizationId,
      journeyId: input.journeyId,
      name: input.name,
      enabled: input.enabled ?? true,
      trigger: input.trigger,
      actions: input.actions,
      createdAt: now,
      updatedAt: now,
    };
    db.automations.push(automation);
    await persist();
    return automation;
  },

  async updateAutomation(orgId, id, input: UpdateAutomationInput) {
    const db = await load();
    const a = db.automations.find((x) => x.id === id && x.organizationId === orgId);
    if (!a) throw new Error("Automation not found.");
    if (input.name !== undefined) a.name = input.name;
    if (input.enabled !== undefined) a.enabled = input.enabled;
    if (input.journeyId !== undefined) a.journeyId = input.journeyId ?? undefined;
    if (input.trigger !== undefined) a.trigger = input.trigger;
    if (input.actions !== undefined) a.actions = input.actions;
    a.updatedAt = new Date().toISOString();
    await persist();
    return a;
  },

  async deleteAutomation(orgId, id) {
    const db = await load();
    db.automations = db.automations.filter((a) => !(a.id === id && a.organizationId === orgId));
    await persist();
  },
};
