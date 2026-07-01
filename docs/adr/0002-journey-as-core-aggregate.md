# ADR-0002: The Journey is the core aggregate; behavior is versioned JSON

- **Status:** Accepted
- **Date:** 2026-07-01

## Context

Competing products center on a *Form*. Forms don't capture branching, scoring,
qualification, theming, automations, or the ad-click-to-customer arc. And a
per-industry data model (tables for `Case`, `Patient`, `RoofEstimate`) would
force code and schema changes for every new vertical — the opposite of the
platform thesis.

## Decision

The primary aggregate is a **Journey**. A Journey's entire behavior is a
**versioned JSON `JourneyDefinition`** (pages, components, expression-based
logic, scoring, qualification, theme) validated by one shared Zod schema
(`src/modules/journeys/domain/schema.ts`). Editing produces a new immutable
`JourneyVersion`; `Journey.publishedVersionId` pins what is live; A/B experiments
split traffic across versions.

There are **no** vertical-specific tables. Answers live in `Lead.answers` (JSON)
plus normalized `LeadAnswer` rows for analytics.

## Consequences

**Positive**

- New verticals ship as **data** (a template), never code — the design test
  ("would this work for a dentist?") is satisfied structurally.
- Atomic, auditable versioning and safe rollbacks; A/B testing is natural.
- The definition is portable: templates, marketplace, import/export are all "a
  blob of validated JSON."

**Negative / mitigations**

- You cannot cheaply run relational queries like "which journeys use component
  X" against a JSON blob → when the Builder needs it, maintain a derived index
  table (component/rule usage) updated on publish. Not needed at v1.
- A JSON schema must evolve carefully → `schemaVersion` is embedded in every
  definition so we can write forward migrations; Zod validates on write.
- Large definitions are read whole → acceptable (journeys are small and cached);
  revisit with fragment loading only if definitions grow pathologically.
