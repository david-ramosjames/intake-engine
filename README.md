# Intake Engine

A configurable, multi-tenant **Customer Journey Platform**. It helps any
business acquire, qualify, collect information from, and convert customers — the
way Typeform, Landbot, GoHighLevel, and Clio Grow do, but driven by a single
data-driven engine that works across industries.

> **The core object is a _Journey_, not a form.** Legal (personal injury) is the
> first vertical. A dentist, roofer, or mortgage broker works tomorrow through
> **configuration, not code**.

---

## Why this exists

Most intake tools are either (a) generic form builders with no qualification /
routing intelligence, or (b) vertical CRMs hard-wired to one industry. Intake
Engine is a **platform**: one engine, unlimited organizations, unlimited
journeys, any industry — because behavior lives in *data* (a versioned JSON
`JourneyDefinition`) validated by a shared schema, not in per-customer code.

The litmus test applied to every feature:
**"Would this still work if tomorrow the customer were a dentist instead of a
lawyer?"** If no — it gets redesigned.

## What's in this repo (v0.1 foundation)

This is the **foundation slice**, built to prove the architecture end-to-end and
be extended, not a finished product. It includes:

- **Multi-tenant Prisma schema** — organizations, domains, users/roles, themes,
  assets, templates, journeys + versions, A/B experiments, leads + answers +
  events, appointments, automations, integrations, AI config, feature flags,
  audit logs. See `prisma/schema.prisma`.
- **The Journey definition schema** (`src/modules/journeys/domain`) — the
  platform's contract, expressed with Zod. This JSON *is* the product.
- **A safe rules engine** (`expression.ts`) — data-driven branching, conditional
  visibility, lead scoring, and qualification, evaluated identically on client
  and server.
- **The runtime Journey Player** (`src/components/runtime`) — a conversational,
  one-question-at-a-time experience (Typeform/Landbot feel) that renders *any*
  definition.
- **Tenant resolution** by host (`middleware.ts` + `src/server/tenant.ts`):
  custom white-label domain → subdomain → platform.
- **Server-authoritative lead capture** (`/api/leads`) — re-scores and
  re-qualifies on the server; never trusts the client.
- **A working Personal Injury intake** (Ramos James Law) expressed entirely as
  configuration (`src/modules/journeys/content/pi-car-accident.ts`).
- **A multi-tenant admin console** — a business switcher (create/switch
  organizations), Overview, Journeys, Leads, Analytics, Automations, Settings.
- **A journey editor** (`src/components/admin/JourneyEditor.tsx`) — edit a
  journey's name, theme, questions, options & scores; each save is validated
  against the schema and stored as a new published version.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design and
[`docs/ROADMAP.md`](docs/ROADMAP.md) for what comes next.

## Tech stack

Next.js 15 (App Router, modular monolith) · React 19 · TypeScript · Tailwind
CSS v4 · PostgreSQL + Prisma · Auth.js · S3-compatible storage · Railway.

## Getting started

```bash
npm install

# 1) DEMO mode — no database required. The data layer persists to a local file
#    (./.data/store.json), so creating businesses, journeys, editing them, and
#    capturing leads all work immediately with zero infrastructure.
npm run dev
#   → http://localhost:3000            (platform landing)
#   → http://localhost:3000/admin      (admin console)
#   → http://localhost:3000/j/car-accident?org=ramos-james   (the live intake)
```

### Run with Postgres

```bash
# 1) Start Postgres (local Docker) — or point at any Postgres (Railway, Neon…)
docker compose up -d

# 2) Configure the connection
cp .env.example .env
#   set DATABASE_URL="postgresql://postgres:postgres@localhost:5432/intake_engine?schema=public"

# 3) Create the schema and seed the first business + journey
npm run db:migrate      # applies prisma/migrations (dev)   — or: npm run db:deploy (prod)
npm run db:seed

# 4) Run
npm run dev
```

When `DATABASE_URL` is set the app automatically switches from the file-backed
DEMO store to Postgres (via Prisma) — same features, real persistence, with each
journey edit stored as a new immutable `JourneyVersion`.

**Deploying to Railway:** add a Postgres plugin (provides `DATABASE_URL`), set
`AUTH_SECRET`, and use build `npm run build` (runs `prisma generate`) with a
release/predeploy step of `npm run db:deploy`.

> **DEMO vs Postgres** is decided solely by whether `DATABASE_URL` is set — the
> app code and features are identical. DEMO mode is for zero-setup local
> exploration; Postgres is the production path.

## Multi-tenancy & white-label

The incoming host determines the organization:

| Host                          | Resolves to                    |
| ----------------------------- | ------------------------------ |
| `intake.ramosjames.com`       | custom domain → `Domain` row   |
| `ramos-james.intakeengine.com`| subdomain → `Organization.slug`|
| `app.intakeengine.com`        | platform (admin / marketing)   |

## Scripts

| Script              | Purpose                                   |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | Dev server (DEMO mode if no DB)           |
| `npm run build`     | `prisma generate` + `next build`          |
| `npm run typecheck` | `tsc --noEmit`                            |
| `npm run db:push`   | Push schema to Postgres                   |
| `npm run db:seed`   | Seed first org + journey                  |
| `npm run db:studio` | Prisma Studio                             |

## Repository layout

```
prisma/                     Schema + seed
src/
  app/                      Next App Router (runtime, admin, api)
  components/runtime/       The Journey Player + field renderers
  middleware.ts             Tenant resolution (edge)
  modules/                  Domain modules (the modular monolith)
    journeys/
      domain/               Journey definition schema + expression language
      runtime/              Navigation, scoring, qualification (isomorphic)
      content/              Seed journeys expressed as config
      repository.ts         Journey data access (DB or DEMO)
    leads/                  Lead intake service
    tenancy/                Host → tenant resolution (pure)
  server/                   DB client, tenant context, demo data
docs/                       Architecture, ADRs, data model, roadmap
```
