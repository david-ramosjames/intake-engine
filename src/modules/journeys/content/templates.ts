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

const dentalNewPatient: JourneyDefinition = {
  schemaVersion: 1,
  name: "New Patient Intake",
  locale: "en",
  theme: { colorBackground: "#0f2e2a", colorAccent: "#2dd4bf", radius: "9999px" },
  variables: [],
  pages: [
    {
      id: "welcome",
      name: "Welcome",
      type: "statement",
      components: [
        { id: "w-h", type: "heading", content: "Welcome to the practice" },
        { id: "w-p", type: "paragraph", content: "Let's get you booked for your first visit." },
      ],
    },
    {
      id: "reason",
      name: "Reason",
      type: "question",
      components: [
        {
          id: "q-reason",
          type: "singleSelect",
          key: "reason",
          label: "What brings you in?",
          validation: { required: true },
          options: [
            { label: "Routine cleaning & checkup", value: "cleaning", score: 5 },
            { label: "Tooth pain", value: "pain", score: 15 },
            { label: "Cosmetic (whitening, veneers)", value: "cosmetic", score: 10 },
            { label: "Emergency", value: "emergency", score: 20 },
          ],
        },
      ],
    },
    {
      id: "insurance",
      name: "Insurance",
      type: "question",
      components: [
        {
          id: "q-ins",
          type: "singleSelect",
          key: "has_insurance",
          label: "Do you have dental insurance?",
          options: [
            { label: "Yes", value: "yes" },
            { label: "No / self-pay", value: "no" },
          ],
        },
      ],
    },
    {
      id: "contact",
      name: "Contact",
      type: "question",
      components: [
        { id: "c-name", type: "shortText", key: "full_name", label: "Full name", validation: { required: true } },
        { id: "c-phone", type: "phone", key: "phone", label: "Phone", validation: { required: true } },
        { id: "c-email", type: "email", key: "email", label: "Email", validation: { required: true } },
      ],
    },
    { id: "success", name: "Success", type: "success", components: [{ id: "s-h", type: "heading", content: "Thanks! Our team will call to schedule your visit." }] },
  ],
  scoring: [],
};

const roofingEstimate: JourneyDefinition = {
  schemaVersion: 1,
  name: "Free Roof Inspection",
  locale: "en",
  theme: { colorBackground: "#1a1206", colorAccent: "#f59e0b", radius: "12px" },
  variables: [],
  pages: [
    {
      id: "welcome",
      name: "Welcome",
      type: "statement",
      components: [
        { id: "w-h", type: "heading", content: "Get your free roof inspection" },
        { id: "w-p", type: "paragraph", content: "Tell us about your roof and we'll schedule an inspection." },
      ],
    },
    {
      id: "issue",
      name: "Issue",
      type: "question",
      components: [
        {
          id: "q-issue",
          type: "singleSelect",
          key: "issue",
          label: "What's going on with your roof?",
          validation: { required: true },
          options: [
            { label: "Storm / hail damage", value: "storm", score: 20 },
            { label: "Leak", value: "leak", score: 15 },
            { label: "Old roof / replacement", value: "replace", score: 15 },
            { label: "Just getting a quote", value: "quote", score: 5 },
          ],
        },
      ],
    },
    {
      id: "ownership",
      name: "Ownership",
      type: "question",
      components: [
        {
          id: "q-own",
          type: "singleSelect",
          key: "owns_home",
          label: "Do you own the home?",
          validation: { required: true },
          options: [
            { label: "Yes", value: "yes", score: 10 },
            { label: "No", value: "no", score: -20 },
          ],
        },
      ],
    },
    {
      id: "contact",
      name: "Contact",
      type: "question",
      components: [
        { id: "c-name", type: "shortText", key: "full_name", label: "Name", validation: { required: true } },
        { id: "c-addr", type: "address", key: "address", label: "Property address", validation: { required: true } },
        { id: "c-phone", type: "phone", key: "phone", label: "Phone", validation: { required: true } },
      ],
    },
    { id: "success", name: "Success", type: "success", components: [{ id: "s-h", type: "heading", content: "Thanks! We'll reach out to schedule your inspection." }] },
    { id: "decline", name: "Not a fit", type: "decline", components: [{ id: "d-h", type: "heading", content: "Thanks for reaching out." }, { id: "d-p", type: "paragraph", content: "We can typically only help homeowners. We appreciate your interest." }] },
  ],
  scoring: [],
  qualification: { rule: { "==": [{ var: "owns_home" }, "yes"] }, onFailGoTo: "decline" },
};

export const journeyTemplates: JourneyTemplate[] = [
  { key: "blank", name: "Blank", industry: "any", description: "Start from scratch — name, email, done.", definition: blank },
  // Personal Injury — one per case type (see pi-templates.ts).
  ...piTemplates,
  // Other industries — proof the same engine serves any vertical.
  { key: "dental-new-patient", name: "Dental — New Patient", industry: "medical.dental", description: "New patient intake: reason for visit, insurance, contact.", definition: dentalNewPatient },
  { key: "roofing-estimate", name: "Roofing — Free Inspection", industry: "contractor.roofing", description: "Homeowner qualification for roof inspection requests.", definition: roofingEstimate },
];

export function getTemplate(key: string): JourneyTemplate | undefined {
  return journeyTemplates.find((t) => t.key === key);
}
