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
  type CreateJourneyInput,
  type CreateLeadInput,
  type CreateOrgInput,
  type PlatformStore,
  type UpdateJourneyInput,
  type StoredJourney,
  type StoredLead,
  type StoredOrg,
} from "./types";

interface Db {
  organizations: StoredOrg[];
  journeys: StoredJourney[];
  leads: StoredLead[];
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
  return { organizations: [org], journeys: [journey], leads: [] };
}

async function load(): Promise<Db> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    cache = JSON.parse(raw) as Db;
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
    if (input.name !== undefined) journey.name = input.name;
    if (input.description !== undefined) journey.description = input.description;
    journey.definition = input.definition;
    journey.updatedAt = new Date().toISOString();
    await persist();
    return journey;
  },

  async listLeads(orgId) {
    const db = await load();
    return db.leads
      .filter((l) => l.orgId === orgId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
      source: input.source,
      campaign: input.campaign,
      medium: input.medium,
      createdAt: new Date().toISOString(),
    };
    db.leads.push(lead);
    await persist();
    return lead;
  },
};
