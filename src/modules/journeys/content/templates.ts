// =============================================================================
// Journey template registry
// -----------------------------------------------------------------------------
// Starter journeys, one per industry, expressed entirely as configuration. This
// is the proof of the platform thesis: a law firm, a dental office, and a
// roofing company are the SAME engine with DIFFERENT data. New "New Journey"
// options are added here — no code changes to the runtime.
// =============================================================================

import type { JourneyDefinition } from "../domain/schema";
import { piTemplates } from "./pi-templates";

export interface JourneyTemplate {
  key: string;
  name: string;
  industry: string;
  description: string;
  definition: JourneyDefinition;
}

const blank: JourneyDefinition = {
  schemaVersion: 1,
  name: "Untitled Journey",
  locale: "en",
  theme: { colorBackground: "#0b1220", colorAccent: "#6366f1", radius: "9999px" },
  variables: [],
  pages: [
    {
      id: "welcome",
      name: "Welcome",
      type: "statement",
      components: [
        { id: "w-h", type: "heading", content: "Welcome" },
        { id: "w-p", type: "paragraph", content: "Answer a few quick questions to get started." },
      ],
    },
    {
      id: "contact",
      name: "Contact",
      type: "question",
      components: [
        { id: "c-name", type: "shortText", key: "full_name", label: "What's your name?", validation: { required: true } },
        { id: "c-email", type: "email", key: "email", label: "Your email", validation: { required: true } },
      ],
    },
    { id: "success", name: "Success", type: "success", components: [{ id: "s-h", type: "heading", content: "Thanks — we'll be in touch." }] },
  ],
  scoring: [],
};

export const journeyTemplates: JourneyTemplate[] = [
  { key: "blank", name: "Blank", industry: "any", description: "Start from scratch — name, email, done.", definition: blank },
  // Personal Injury — one per case type (see pi-templates.ts).
  ...piTemplates,
];

export function getTemplate(key: string): JourneyTemplate | undefined {
  return journeyTemplates.find((t) => t.key === key);
}

// Top-level industry category, e.g. "legal.personal_injury" -> "legal".
function categoryOf(industry?: string): string {
  return (industry ?? "").split(".")[0] ?? "";
}

/**
 * Templates offered when creating a journey for a business in `industry`.
 * Always includes industry-agnostic templates (Blank) plus any template whose
 * top-level category matches the business's, so a legal firm sees the PI
 * templates and a dentist would see only Blank until dental templates exist.
 */
export function templatesForIndustry(industry?: string): JourneyTemplate[] {
  const cat = categoryOf(industry);
  return journeyTemplates.filter((t) => t.industry === "any" || categoryOf(t.industry) === cat);
}
