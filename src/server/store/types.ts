// Storage-facing record shapes. Intentionally decoupled from Prisma's generated
// types so the same interface has two interchangeable backends: a file-backed
// DEMO store (no infrastructure) and a Prisma/Postgres store (production).

import type { JourneyDefinition } from "@/modules/journeys/domain/schema";

export interface StoredOrg {
  id: string;
  slug: string;
  name: string;
  industry?: string;
  createdAt: string;
}

export interface StoredJourney {
  id: string;
  orgId: string;
  slug: string;
  name: string;
  description?: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  definition: JourneyDefinition;
  createdAt: string;
  updatedAt: string;
}

export type LeadOutcome = "lead" | "referral" | "declined";

export interface StoredLead {
  id: string;
  orgId: string;
  journeyId: string;
  journeySlug: string;
  status: "QUALIFIED" | "REFERRED" | "DISQUALIFIED";
  outcome: LeadOutcome;
  displayName?: string;
  email?: string;
  phone?: string;
  score: number;
  qualified: boolean;
  referral: boolean;
  answers: Record<string, unknown>;
  context: Record<string, string>;
  source?: string;
  campaign?: string;
  medium?: string;
  createdAt: string;
}

export interface CreateOrgInput {
  name: string;
  slug: string;
  industry?: string;
}

export interface CreateJourneyInput {
  name: string;
  slug: string;
  description?: string;
  definition: JourneyDefinition;
}

export interface UpdateJourneyInput {
  name?: string;
  description?: string;
  definition: JourneyDefinition;
}

export interface CreateLeadInput {
  orgId: string;
  journeyId: string;
  journeySlug: string;
  outcome: LeadOutcome;
  qualified: boolean;
  referral: boolean;
  score: number;
  answers: Record<string, unknown>;
  context?: Record<string, string>;
  displayName?: string;
  email?: string;
  phone?: string;
  source?: string;
  campaign?: string;
  medium?: string;
}

export interface PlatformStore {
  listOrganizations(): Promise<StoredOrg[]>;
  getOrganization(id: string): Promise<StoredOrg | null>;
  getOrganizationBySlug(slug: string): Promise<StoredOrg | null>;
  createOrganization(input: CreateOrgInput): Promise<StoredOrg>;

  listJourneys(orgId: string): Promise<StoredJourney[]>;
  getJourney(orgId: string, slug: string): Promise<StoredJourney | null>;
  createJourney(orgId: string, input: CreateJourneyInput): Promise<StoredJourney>;
  updateJourney(orgId: string, slug: string, input: UpdateJourneyInput): Promise<StoredJourney>;

  listLeads(orgId: string): Promise<StoredLead[]>;
  getLead(orgId: string, id: string): Promise<StoredLead | null>;
  createLead(input: CreateLeadInput): Promise<StoredLead>;
  deleteLead(orgId: string, id: string): Promise<void>;
}

/** Small URL-safe id (not a cuid, but fine for the DEMO store). */
export function newId(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Human-friendly label for a dotted industry key, e.g.
 *  "legal.personal_injury" -> "Legal · Personal injury". */
export function industryLabel(industry?: string): string {
  if (!industry) return "—";
  return industry
    .split(".")
    .map((part) => {
      const words = part.replace(/_/g, " ");
      return words.charAt(0).toUpperCase() + words.slice(1);
    })
    .join(" · ");
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
