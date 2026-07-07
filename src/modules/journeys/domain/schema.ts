// =============================================================================
// Journey Definition — the canonical config schema (Zod)
// -----------------------------------------------------------------------------
// This is the platform's contract. A JourneyVersion.definition MUST validate
// against `journeyDefinitionSchema`. Because behavior is data, the same schema
// supports a law firm, a dentist, or a roofer with zero code changes — only a
// different definition. The Journey Builder is a UI that produces this JSON.
// =============================================================================

import { z } from "zod";
import { expressionSchema } from "./expression";

// --- Components -------------------------------------------------------------
// The full component catalog. Field components carry a `key` used to store the
// answer and reference it in expressions. Content components are presentational.

export const componentType = z.enum([
  // content
  "heading",
  "paragraph",
  "richText",
  "image",
  "video",
  "progress",
  // inputs
  "shortText",
  "longText",
  "email",
  "phone",
  "number",
  "currency",
  "date",
  "time",
  "address",
  "dropdown",
  "radio",
  "checkbox",
  "singleSelect",
  "multiSelect",
  "fileUpload",
  "photoUpload",
  "signature",
  // interactive / terminal
  "appointment",
  "review",
  "payment",
  "ai",
]);
export type ComponentType = z.infer<typeof componentType>;

export const optionSchema = z.object({
  label: z.string(),
  value: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),
  // Points added to the lead score when this option is selected (optional).
  score: z.number().optional(),
  // Flow-builder branching: jump to this page id when this option is chosen.
  goTo: z.string().optional(),
});
export type Option = z.infer<typeof optionSchema>;

// A call-to-action on an ending screen: call, text, schedule, or a link.
export const ctaSchema = z.object({
  label: z.string(),
  // How to interpret `value`: phone for call/text; URL for schedule/link/custom.
  type: z.enum(["call", "text", "schedule", "link", "custom"]).optional(),
  value: z.string().optional(),
  // Explicit href overrides type+value when present (legacy/back-compat).
  href: z.string().optional(),
  style: z.enum(["primary", "secondary"]).default("primary"),
});
export type Cta = z.infer<typeof ctaSchema>;

/** Resolve the actual href for a CTA from its type/value (or explicit href). */
export function ctaHref(cta: Cta): string {
  if (cta.href) return cta.href;
  const v = (cta.value ?? "").trim();
  if (cta.type === "call") return `tel:${v.replace(/[^\d+]/g, "")}`;
  if (cta.type === "text") return `sms:${v.replace(/[^\d+]/g, "")}`;
  return v;
}

export const validationSchema = z
  .object({
    required: z.boolean().optional(),
    minLength: z.number().optional(),
    maxLength: z.number().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional(),
  })
  .optional();

export const componentSchema = z.object({
  id: z.string(),
  type: componentType,
  // Present on input components; the answer is stored under this key.
  key: z.string().optional(),
  label: z.string().optional(),
  helpText: z.string().optional(),
  placeholder: z.string().optional(),
  // Static content for presentational components.
  content: z.string().optional(),
  src: z.string().optional(),
  options: z.array(optionSchema).optional(),
  validation: validationSchema,
  // Conditional visibility for a single component.
  condition: expressionSchema.optional(),
  // Free-form per-type props (rows, currency code, accept, etc.).
  props: z.record(z.unknown()).optional(),
});
export type Component = z.infer<typeof componentSchema>;

// --- Pages ------------------------------------------------------------------

// Terminal screens. A flow branches to one of these to finish:
//   success  = it's a lead      referral = refer out      decline = can't help
// "end" is a generic terminal (kept for existing flows). success/decline also
// serve score/qualification-driven journeys.
export const pageType = z.enum([
  "question",
  "statement",
  "review",
  "success",
  "referral",
  "decline",
  "end",
]);
export type PageType = z.infer<typeof pageType>;

/** The lead outcome recorded when a flow reaches a given ending type. */
export function outcomeForPageType(type: PageType): "lead" | "referral" | "declined" | null {
  if (type === "success" || type === "end") return "lead";
  if (type === "referral") return "referral";
  if (type === "decline") return "declined";
  return null;
}

export const navigationRuleSchema = z.object({
  when: expressionSchema, // if true, jump to `goTo`
  goTo: z.string(), // target page id
});

export const pageSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: pageType.default("question"),
  // Page-level visibility: skip entirely when false.
  condition: expressionSchema.optional(),
  // Conditional branching evaluated in order; first match wins. When none
  // match, advance to the next visible page.
  next: z.array(navigationRuleSchema).optional(),
  // Call-to-action buttons, shown on terminal/ending screens (call, website…).
  cta: z.array(ctaSchema).optional(),
  components: z.array(componentSchema),
});
export type Page = z.infer<typeof pageSchema>;

// --- Scoring & qualification ------------------------------------------------

export const scoringRuleSchema = z.object({
  when: expressionSchema,
  points: z.number(),
  label: z.string().optional(),
});

export const qualificationSchema = z
  .object({
    // Lead is qualified when this evaluates truthy. Optional; may also derive
    // purely from score thresholds.
    rule: expressionSchema.optional(),
    minScore: z.number().optional(),
    // Where to send a disqualified lead: a page id (usually a decline page).
    onFailGoTo: z.string().optional(),
  })
  .optional();

// --- Theme (per-journey overrides) ------------------------------------------

export const themeTokensSchema = z
  .object({
    colorBackground: z.string().optional(),
    colorSurface: z.string().optional(),
    colorText: z.string().optional(),
    colorPrimary: z.string().optional(),
    colorOnPrimary: z.string().optional(),
    colorAccent: z.string().optional(),
    fontFamily: z.string().optional(),
    radius: z.string().optional(),
    // Answer-button colors (resting + hover). Fall back to an inverse-contrast
    // hover derived from background/text when unset.
    buttonBg: z.string().optional(),
    buttonText: z.string().optional(),
    buttonHoverBg: z.string().optional(),
    buttonHoverText: z.string().optional(),
    // Branding: a logo shown at the top, and an optional side/hero image shown
    // on the left on desktop. `logoLink` makes the logo clickable.
    logoUrl: z.string().optional(),
    logoLink: z.string().optional(),
    sideImageUrl: z.string().optional(),
  })
  .partial();
export type ThemeTokens = z.infer<typeof themeTokensSchema>;

// --- Journey ----------------------------------------------------------------

export const variableSchema = z.object({
  key: z.string(),
  type: z.enum(["string", "number", "boolean"]).default("string"),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

export const journeyDefinitionSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  name: z.string(),
  locale: z.string().default("en"),
  // Languages the visitor can switch between. The first is the default. When
  // more than one, the runtime shows a language toggle.
  languages: z.array(z.string()).optional(),
  // Translations, keyed by locale then by a stable text key (see i18n.ts).
  // e.g. { es: { "c:case:label": "¿Qué tipo de caso?" } }
  i18n: z.record(z.record(z.string())).optional(),
  theme: themeTokensSchema.optional(),
  variables: z.array(variableSchema).default([]),
  pages: z.array(pageSchema).min(1),
  scoring: z.array(scoringRuleSchema).default([]),
  qualification: qualificationSchema,
});
export type JourneyDefinition = z.infer<typeof journeyDefinitionSchema>;

/** Parse & validate untrusted JSON into a JourneyDefinition. Throws on invalid. */
export function parseJourneyDefinition(input: unknown): JourneyDefinition {
  return journeyDefinitionSchema.parse(input);
}

export function safeParseJourneyDefinition(input: unknown) {
  return journeyDefinitionSchema.safeParse(input);
}
