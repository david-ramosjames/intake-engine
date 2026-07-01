# Architecture

> Audience: engineers and technical stakeholders. This document explains the
> shape of the platform, the decisions behind it, and — importantly — the
> trade-offs we consciously accepted. Point-in-time decisions live as ADRs in
> [`docs/adr/`](./adr).

## 1. Thesis

The platform is an **operating system for customer acquisition**. Its primary
aggregate is the **Journey**: the whole experience from ad-click to customer.
Everything a business configures — pages, questions, logic, scoring,
qualification, automations, theming — is **data**, stored as a versioned JSON
`JourneyDefinition` that validates against one shared schema.

Because behavior is data, the *same engine* serves a law firm, a dental office,
and a roofing company. There is no `Case`, `Patient`, or `Matter` table. There
is a **Lead** moving through a **Journey**, and the vertical-specific shape lives
in `answers` (JSON) + normalized `LeadAnswer` rows.

**Design test for every feature:** *"Would this still work if tomorrow the
customer were a dentist instead of a lawyer?"*

## 2. System context

```
                 ┌───────────────────────────────────────────────┐
   Ad click ───▶ │  Runtime (public)     /j/[slug]               │
                 │  • Journey Player (conversational, isomorphic) │
                 │  • Tenant resolved from Host                   │
                 └───────────────┬───────────────────────────────┘
                                 │ POST /api/leads (authoritative scoring)
                 ┌───────────────▼───────────────────────────────┐
   Staff ──────▶ │  Admin (private)      /admin                   │
                 │  • Journey Builder, CRM, Analytics, Automations│
                 └───────────────┬───────────────────────────────┘
                                 │
        ┌────────────────────────▼─────────────────────────┐
        │  Modular monolith (Next.js server)                │
        │  Presentation │ Application │ Domain │ Infra       │
        └───────┬──────────────┬──────────────┬─────────────┘
                │              │              │
          PostgreSQL     S3 storage      AI / integrations
          (Prisma)       (uploads)       (Claude, Slack, CRM…)
```

## 3. Layered modular monolith

We ship a **modular monolith** (ADR-0001), not microservices. One deployable,
clear module boundaries, extraction-ready later. Layers:

| Layer            | Responsibility                                    | Here |
| ---------------- | ------------------------------------------------- | ---- |
| **Presentation** | React (App Router pages, runtime player, admin)   | `src/app`, `src/components` |
| **Application**  | Use-cases / services orchestrating domain + infra | `src/modules/*/service.ts`, route handlers |
| **Domain**       | Pure business logic & types (no I/O)              | `src/modules/journeys/{domain,runtime}`, `src/modules/tenancy` |
| **Infra/Persistence** | DB client, storage, tenant context           | `src/server` |

**Dependency rule:** dependencies point inward. The domain (rules engine,
journey schema, scoring) imports nothing from infrastructure or React — which is
why the *same* engine code runs in the browser (live visibility) and on the
server (authoritative scoring).

### Modules

- `journeys` — the flagship. `domain` (definition schema + expression language),
  `runtime` (navigation, scoring, qualification), `content` (seed journeys as
  config), `repository` (data access).
- `leads` — lead intake service (server-authoritative).
- `tenancy` — pure host → tenant resolution.
- *(Roadmap modules: `automations`, `ai`, `analytics`, `crm`, `billing`.)*

## 4. The Journey definition (the platform's contract)

A `JourneyVersion.definition` is JSON validated by
`journeyDefinitionSchema` (`src/modules/journeys/domain/schema.ts`):

```jsonc
{
  "schemaVersion": 1,
  "theme":   { "colorBackground": "#0b1f3a", "colorAccent": "#e63946" },
  "variables": [{ "key": "firm", "default": "Ramos James Law" }],
  "pages": [
    { "id": "incident_type", "type": "question", "components": [
      { "id": "q", "type": "singleSelect", "key": "accident_type",
        "validation": { "required": true },
        "options": [{ "label": "Car Accident", "value": "car", "score": 10 }] }
    ]},
    { "id": "treatment", "type": "question", "components": [
      { "id": "t", "type": "singleSelect", "key": "sought_treatment",
        "condition": { "==": [{ "var": "injured" }, "yes"] }, "options": [...] }
    ]}
  ],
  "scoring": [{ "when": {...}, "points": 5 }],
  "qualification": { "rule": {...}, "minScore": 20, "onFailGoTo": "decline" }
}
```

The **Journey Builder** (roadmap) is simply a visual editor that *produces this
JSON*. Templates and the future marketplace are just saved definitions.

### The rules engine

`expression.ts` implements a small, safe, JSON-encoded expression language (a
lean subset of the JsonLogic idea): `var`, `==`, `!=`, `>`, `<`, `and`, `or`,
`not`, `in`, `contains`, `empty`, `present`. Properties we require:

- **Safe** — no `eval`, no code; it only walks a data tree.
- **Total** — malformed rules return `undefined`, never throw, so a bad rule
  can't crash a live journey.
- **Isomorphic** — one implementation drives client-side conditional visibility
  *and* server-side scoring/qualification.

This is the substrate for branching, conditional components/pages, lead scoring,
and qualification — all data, all authorable, all versioned.

## 5. Multi-tenancy

Every tenant-owned row carries `organizationId`. Isolation is defense-in-depth:

1. **Application scoping** — the data-access layer always filters by
   `organizationId` derived from the resolved tenant.
2. **Postgres Row-Level Security** (production) — policies keyed to a session
   GUC (`app.current_org`) so a query can't escape its tenant even on a bug.
3. **Tenant resolution** — `middleware.ts` derives a host hint at the edge;
   `src/server/tenant.ts` resolves it to an `Organization` (custom domain →
   subdomain → platform). See ADR-0003.

White-label: an org maps unlimited custom domains (`intake.ramosjames.com`) to
its journeys; the platform picks the tenant purely from the incoming `Host`.

## 6. Server-authoritative intake

The client player is for UX; it is never trusted for outcomes. `/api/leads`
reloads the journey for the resolved tenant and **re-scores and re-qualifies**
the submitted answers via the same domain engine, then persists `Lead`,
normalized `LeadAnswer` rows, and an append-only `LeadEvent` stream. Automations
(`LEAD_COMPLETED`) fire from here.

## 7. Data model highlights

See `prisma/schema.prisma` and [`DATA-MODEL.md`](./DATA-MODEL.md). Key choices:

- **Versioned journeys** — editing creates a new `JourneyVersion`; you never
  mutate a published version. `Journey.publishedVersionId` pins what's live.
  A/B tests split traffic across versions.
- **Leads store answers twice** — a JSON snapshot on `Lead.answers` (fast, whole
  record) *and* normalized `LeadAnswer` rows (queryable analytics). Deliberate
  denormalization.
- **Append-only history** — `LeadEvent` and `AuditLog` are immutable streams
  (CRM timeline, compliance).
- **Automations as data** — trigger + ordered actions as JSON; `AutomationRun`
  supports delayed/scheduled execution.

## 8. Deliberate trade-offs (and what we'd revisit)

| Decision | Why | Cost / when we revisit |
| --- | --- | --- |
| Modular monolith | Fastest path; one deploy; refactor-friendly | Extract hot modules (automation workers, AI) to services when scale demands (ADR-0001). |
| JSON `definition` over relational page/component tables | Journeys are read whole and versioned atomically; schema evolves without migrations | Can't SQL-query "all journeys using component X" cheaply → add a derived index table when the Builder needs it (ADR-0002). |
| Answers stored as JSON **and** normalized rows | Whole-record reads *and* analytics both matter | Write amplification; keep them consistent in one transaction. |
| RLS + app scoping (not schema-per-tenant) | Scales to 100k+ orgs without 100k schemas; simpler migrations | A single noisy tenant shares tables → partition/shard `Lead` by org when needed. |
| DB layer decoupled from generated Prisma types (`getPrisma()` returns a structural `Db`) | Lets the app build & run in DEMO mode with zero DB infra | Loses Prisma's compile-time type safety in ~4 files; acceptable for the foundation, revisit once DB is always present in CI. |
| DEMO mode fallback | Instant onboarding / previews with no infra | Not a persistence path; clearly flagged in the admin. |

## 9. Security posture (foundation → roadmap)

Present: server-authoritative scoring, Zod validation at every boundary, tenant
isolation, append-only audit trail, secrets via env, external-package isolation
of Prisma. Roadmap: Auth.js sessions + RBAC enforcement on `Membership.role`,
Postgres RLS policies, envelope encryption of integration credentials, signed
S3 upload URLs, rate limiting, GDPR/CCPA data-subject flows. See `docs/ROADMAP.md`.

## 10. Scale trajectory

Architected toward 100k+ organizations and millions of leads / workflow runs:
stateless server (horizontal scale), Postgres with per-org partitioning of hot
tables, a queue-backed automation worker (extractable), object storage for
documents, and read-replica-friendly analytics. None of these are needed at v1,
but no v1 decision blocks them.
