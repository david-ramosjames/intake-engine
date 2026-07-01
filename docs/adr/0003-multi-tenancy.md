# ADR-0003: Multi-tenancy via shared schema + org scoping + RLS

- **Status:** Accepted
- **Date:** 2026-07-01

## Context

The platform must host unlimited organizations with complete isolation, support
white-label custom domains, and scale to 100k+ tenants. The three common
patterns are: database-per-tenant, schema-per-tenant, and a shared schema with a
tenant discriminator.

## Decision

Use a **shared schema with an `organizationId` discriminator** on every
tenant-owned row, defended in depth:

1. **Application scoping** — the data-access layer always filters by the
   `organizationId` of the resolved tenant. The tenant is derived from the
   request `Host` (`middleware.ts` sets a hint; `src/server/tenant.ts` resolves
   it: custom domain → subdomain → platform).
2. **Postgres Row-Level Security** (production) — RLS policies keyed to a session
   GUC (`app.current_org`) set per request/transaction, so even a query that
   forgets its `where` cannot cross tenants.
3. **White-label** — a `Domain` table maps arbitrary hostnames to organizations;
   tenant selection is purely host-driven, enabling `intake.ramosjames.com`.

## Consequences

**Positive**

- Scales to 100k+ tenants without 100k schemas/databases; migrations run once.
- Cross-tenant platform analytics and operations are straightforward.
- Defense-in-depth: an app-layer bug is still contained by RLS.

**Negative / mitigations**

- A shared table is a single blast radius and a noisy tenant can affect others →
  partition/shard hot tables (`Lead`, `LeadEvent`, `AutomationRun`) by
  `organizationId` when volume demands; per-tenant rate limits.
- Every query must be tenant-scoped → centralize access behind repositories and
  enforce RLS so scoping is not purely a matter of developer discipline.
- Setting the session GUC correctly per request is critical → done in a single
  request-scoped seam alongside tenant resolution.
