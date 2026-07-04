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
  // Points added to the lead score when this option is selected.
  score: z.number().optional(),
});
export type Option = z.infer<typeof optionSchema>;

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

export const pageType = z.enum(["question", "statement", "review", "success", "decline"]);
export type PageType = z.infer<typeof pageType>;

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
    logoUrl: z.string().optional(),
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
