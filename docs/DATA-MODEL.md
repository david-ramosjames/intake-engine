# Data Model

Source of truth: [`prisma/schema.prisma`](../prisma/schema.prisma). This is a
narrative map of the entities and how they relate.

## Domains of the schema

### Tenancy & identity
- **Organization** — the tenant. Owns everything. `slug` powers subdomains.
- **Domain** — white-label hostnames mapped to an org (`intake.ramosjames.com`).
- **User** — a global identity; may belong to many orgs.
- **Membership** — binds `User` ↔ `Organization` with a `Role`
  (`OWNER/ADMIN/MEMBER/AGENT/VIEWER`). Authorization is checked here.
- **Session** — Auth.js sessions.

### Branding & assets
- **Theme** — design tokens (colors, typography, radius, dark mode) per org.
- **Asset** — logos, images, videos, and end-user uploads (S3 keys).

### Journeys (flagship)
- **Template** — a saved definition; org-scoped or global (marketplace).
- **Journey** — a named acquisition experience; `slug` unique per org; points to
  its live `publishedVersionId`.
- **JourneyVersion** — immutable snapshot of the full `definition` JSON. Editing
  creates a new version; publishing pins one.
- **Experiment / ExperimentVariant** — A/B tests splitting traffic across
  versions.

### Leads (universal customer object)
- **Lead** — a person moving through a journey. Denormalized contact fields +
  `score`, `qualified`, attribution (`source/campaign/medium`), and a full
  `answers` JSON snapshot.
- **LeadAnswer** — normalized answer rows (keyed by `componentKey`) for
  analytics/querying.
- **LeadEvent** — append-only CRM timeline (`CREATED`, `COMPLETED`, `SCORED`,
  `QUALIFIED`, `ASSIGNED`, `NOTE_ADDED`, `AUTOMATION_TRIGGERED`, …).
- **LeadTag**, **Appointment** — tagging and scheduling.

### Automation, integrations, AI
- **Automation** — trigger (JSON) + ordered actions (JSON); org- or
  journey-scoped.
- **AutomationRun** — an execution record; supports delayed/scheduled runs via
  `scheduledFor` (the seam for a future worker).
- **Integration** — third-party connectors; credentials envelope-encrypted.
- **AiConfig** — per-capability AI settings (qualification, summary, OCR,
  translation) with a configurable prompt/model.

### Platform ops
- **FeatureFlag** — global or per-org flags.
- **AuditLog** — immutable security/compliance trail.

## Entity relationships (abridged)

```
Organization 1─* Domain
Organization 1─* Membership *─1 User
Organization 1─* Journey 1─* JourneyVersion
Journey        1─1 published → JourneyVersion
Journey        1─* Experiment 1─* ExperimentVariant *─1 JourneyVersion
Organization 1─* Lead *─1 Journey
Lead         1─* LeadAnswer
Lead         1─* LeadEvent   (append-only)
Organization 1─* Automation 1─* AutomationRun
```

## Why answers are stored twice

`Lead.answers` (JSON) gives a fast, atomic whole-record read for the CRM detail
view and re-scoring. `LeadAnswer` rows give queryable analytics ("average score
by `accident_type`", "drop-off after the fault question") without JSON
gymnastics. Both are written in one transaction to stay consistent. This is a
deliberate denormalization — see ADR-0002.

## Indexing notes

Hot query paths are indexed: leads by `(organizationId, status)` and
`(organizationId, journeyId)`; events by `(leadId, createdAt)`; automation runs
by `(status, scheduledFor)` for the worker to poll due jobs. As volume grows,
`Lead`/`LeadEvent`/`AutomationRun` are the first candidates for per-org
partitioning (ADR-0003).
