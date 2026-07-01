# Roadmap

The v0.1 foundation proves the core loop: config-driven Journey → tenant
resolution → conversational runtime → server-authoritative scoring/qualification
→ lead capture, with a normalized multi-tenant schema behind it. This is the
sequence to build a fundable platform on top of it. Ordered by leverage.

## Now (foundation — in this repo)
- [x] Multi-tenant Prisma schema (orgs, journeys+versions, leads, automations, …)
- [x] Journey definition schema (Zod) + safe rules engine (isomorphic)
- [x] Conversational Journey Player rendering any definition
- [x] Host-based tenant resolution (custom domain / subdomain / platform)
- [x] Server-authoritative lead capture (`/api/leads`)
- [x] Personal Injury (Ramos James) intake expressed entirely as config
- [x] Minimal admin (journeys list) + DEMO mode

## Next (make it operable)
1. **Auth & RBAC** — Auth.js sessions; enforce `Membership.role` on all admin
   routes and mutations; org switcher.
2. **Persist for real** — wire Railway Postgres; enable RLS policies + the
   per-request `app.current_org` GUC seam; run seed.
3. **CRM** — lead list with saved views/filters, lead detail with the
   `LeadEvent` timeline, notes, tags, assignment.
4. **Journey Builder v1** — visual editor that produces `JourneyDefinition`:
   page/component canvas, logic panel (rules engine UI), theme editor, publish +
   version history. Autosave via Server Actions.

## Then (make it a platform)
5. **Automation Engine** — queue-backed `AutomationRun` worker; actions: email,
   SMS, Slack/Teams, webhooks, CRM update, task/appointment creation, delayed &
   conditional workflows. (First candidate for service extraction — ADR-0001.)
6. **AI Engine** — Claude-powered qualification, conversation summaries, OCR of
   uploads, translation, suggested/dynamic questions; per-org `AiConfig`.
7. **File uploads & signatures** — signed S3 URLs, virus scanning, document
   components; e-signature.
8. **Analytics** — funnel/drop-off, question analytics, source/campaign
   attribution, revenue attribution, AI/automation performance.
9. **A/B testing UX** — traffic splitting, winner selection, per-question
   optimization.
10. **Templates & marketplace** — publish/clone definitions across orgs and
    industries (dental, roofing, mortgage, …), proving the config-not-code thesis.

## Later (enterprise & global)
- Public API + SDKs + webhooks; billing/subscriptions; localization &
  translations; white-label theming polish; command palette / premium admin UX;
  heatmaps; mobile apps; horizontal scale (partitioning, read replicas, service
  extraction).

## Security & compliance (continuous)
Auth + RBAC · Postgres RLS · envelope-encrypted integration secrets · signed
uploads · rate limiting · GDPR/CCPA data-subject flows · OWASP review ·
comprehensive audit logging.
