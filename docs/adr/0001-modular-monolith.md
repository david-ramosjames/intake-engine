# ADR-0001: Modular monolith over microservices

- **Status:** Accepted
- **Date:** 2026-07-01

## Context

We are building a multi-tenant platform intended to scale to 100k+ organizations
and millions of leads and workflow executions. The naive "enterprise" instinct
is to start with microservices (intake, automation, AI, CRM, analytics as
separate deployables). We are a small team optimizing for velocity *and* a
decade-long architecture.

## Decision

Ship a **modular monolith** on Next.js: a single deployable with strict internal
module boundaries and a layered dependency rule (Presentation → Application →
Domain; Infrastructure implements ports). Modules (`journeys`, `leads`,
`tenancy`, and future `automations`, `ai`, `analytics`, `crm`) communicate
through explicit service interfaces, not by reaching into each other's internals
or tables.

## Consequences

**Positive**

- One deploy, one local dev story, atomic refactors across boundaries.
- No premature distributed-systems tax (network hops, partial failure, eventual
  consistency) while the domain model is still moving.
- Boundaries are enforced in code, so extraction later is mechanical.

**Negative / mitigations**

- A monolith can rot into a big ball of mud → we enforce the dependency rule and
  keep the domain layer I/O-free (the rules engine imports nothing infra).
- Some workloads (automation execution, AI/OCR, heavy analytics) will want
  independent scaling and isolation. **Extraction trigger:** when a module's
  latency/throughput or blast-radius needs diverge from the request path, pull
  it into a service that consumes the same domain package. The automation
  engine — already modeled as queued `AutomationRun` records — is the expected
  first extraction (a worker), with no API change to the rest of the system.
