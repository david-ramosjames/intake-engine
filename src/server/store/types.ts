// Storage-facing record shapes. Intentionally decoupled from Prisma's generated
// types so the same interface has two interchangeable backends: a file-backed
// DEMO store (no infrastructure) and a Prisma/Postgres store (production).

import type { JourneyDefinition } from "@/modules/journeys/domain/schema";

export interface StoredOrg {
  id: string;
  slug: string;
  name: string;
  industry?: string;
  // Server-only settings blob (integration credentials, etc.). Never sent to
  // the public runtime — only name/slug/id are used for attribution.
  settings?: Record<string, unknown>;
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
  // New URL path/slug. When changed it must stay unique within the org.
  slug?: string;
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

// Enrich an already-created lead with the answers gathered after it was first
// submitted (e.g. when the lead fired at a mid-flow conversion point and the
// visitor went on to answer more qualifying questions). Outcome/status are left
// as first recorded — this only fills in the fuller picture.
export interface UpdateLeadInput {
  answers: Record<string, unknown>;
  score?: number;
  displayName?: string;
  email?: string;
  phone?: string;
  context?: Record<string, string>;
}

export interface StoredDomain {
  id: string;
  organizationId: string;
  // Journey served at this domain's root; null → org's first published journey.
  journeyId?: string;
  hostname: string;
  verifiedAt?: string;
  createdAt: string;
}

export interface CreateDomainInput {
  organizationId: string;
  journeyId?: string;
  hostname: string;
}

// --- Automations ------------------------------------------------------------
// A trigger (currently just LEAD_COMPLETED) with an ordered list of actions.
// Actions carry their own config; text fields support {{placeholder}} tokens
// filled from the lead (name, email, phone, journey, score, and any answer key).

export interface EmailAction {
  type: "email";
  to: string;
  subject: string;
  body: string;
}
export interface SlackAction {
  type: "slack";
  webhookUrl: string;
  message: string;
}
export type AutomationAction = EmailAction | SlackAction;

export interface StoredAutomation {
  id: string;
  organizationId: string;
  // Scope to a single journey, or all of the org's journeys when undefined.
  journeyId?: string;
  name: string;
  enabled: boolean;
  trigger: { event: string };
  actions: AutomationAction[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateAutomationInput {
  organizationId: string;
  journeyId?: string;
  name: string;
  enabled?: boolean;
  trigger: { event: string };
  actions: AutomationAction[];
}

export interface UpdateAutomationInput {
  name?: string;
  enabled?: boolean;
  journeyId?: string | null;
  trigger?: { event: string };
  actions?: AutomationAction[];
}

export type EventType = "opened" | "started" | "completed" | "cta_click";

export interface StoredEvent {
  id: string;
  orgId: string;
  journeySlug?: string;
  sessionId: string;
  type: EventType;
  outcome?: LeadOutcome;
  source?: string;
  pageUrl?: string;
  createdAt: string;
}

export interface RecordEventInput {
  orgId: string;
  journeySlug?: string;
  sessionId: string;
  type: EventType;
  outcome?: LeadOutcome;
  source?: string;
  pageUrl?: string;
}

export interface PlatformStore {
  listOrganizations(): Promise<StoredOrg[]>;
  getOrganization(id: string): Promise<StoredOrg | null>;
  getOrgSettings(orgId: string): Promise<Record<string, unknown>>;
  saveOrgSettings(orgId: string, settings: Record<string, unknown>): Promise<void>;
  getOrganizationBySlug(slug: string): Promise<StoredOrg | null>;
  createOrganization(input: CreateOrgInput): Promise<StoredOrg>;

  listJourneys(orgId: string): Promise<StoredJourney[]>;
  getJourney(orgId: string, slug: string): Promise<StoredJourney | null>;
  createJourney(orgId: string, input: CreateJourneyInput): Promise<StoredJourney>;
  updateJourney(orgId: string, slug: string, input: UpdateJourneyInput): Promise<StoredJourney>;
  duplicateJourney(orgId: string, slug: string): Promise<StoredJourney>;
  deleteJourney(orgId: string, slug: string): Promise<void>;

  listLeads(orgId: string): Promise<StoredLead[]>;
  getLead(orgId: string, id: string): Promise<StoredLead | null>;
  createLead(input: CreateLeadInput): Promise<StoredLead>;
  updateLead(orgId: string, id: string, input: UpdateLeadInput): Promise<StoredLead | null>;
  deleteLead(orgId: string, id: string): Promise<void>;

  recordEvent(input: RecordEventInput): Promise<void>;
  listEvents(orgId: string, sinceISO?: string): Promise<StoredEvent[]>;

  listDomains(orgId: string): Promise<StoredDomain[]>;
  addDomain(input: CreateDomainInput): Promise<StoredDomain>;
  deleteDomain(orgId: string, id: string): Promise<void>;
  getDomainByHost(hostname: string): Promise<StoredDomain | null>;

  listAutomations(orgId: string): Promise<StoredAutomation[]>;
  createAutomation(input: CreateAutomationInput): Promise<StoredAutomation>;
  updateAutomation(orgId: string, id: string, input: UpdateAutomationInput): Promise<StoredAutomation>;
  deleteAutomation(orgId: string, id: string): Promise<void>;
}

/** Normalize a hostname for storage/lookup: lowercase, strip scheme/port/path. */
export function normalizeHostname(input: string): string {
  let h = input.trim().toLowerCase();
  h = h.replace(/^https?:\/\//, "");
  h = h.split("/")[0] ?? h;
  h = h.split(":")[0] ?? h; // strip port
  return h;
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
