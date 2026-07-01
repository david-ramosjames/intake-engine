// =============================================================================
// Seed content: Personal Injury — Car Accident intake (Ramos James Law)
// -----------------------------------------------------------------------------
// This is the FIRST vertical expressed entirely as configuration. Note there is
// nothing legal-specific in the engine — only in this data. Swapping this for a
// dental "New Patient" definition would produce a working dental intake with no
// code changes. That is the whole thesis of the platform.
// =============================================================================

import type { JourneyDefinition } from "../domain/schema";

export const carAccidentJourney: JourneyDefinition = {
  schemaVersion: 1,
  name: "Car Accident — Google Ads",
  locale: "en",
  theme: {
    colorBackground: "#0b1f3a",
    colorSurface: "#12294b",
    colorText: "#ffffff",
    colorPrimary: "#ffffff",
    colorOnPrimary: "#0b1f3a",
    colorAccent: "#e63946",
    radius: "9999px",
    fontFamily: "var(--font-sans)",
  },
  variables: [{ key: "firm", type: "string", default: "Ramos James Law, PLLC" }],
  pages: [
    {
      id: "welcome",
      name: "Welcome",
      type: "statement",
      components: [
        { id: "w-h", type: "heading", content: "Ramos James Law" },
        { id: "w-p", type: "paragraph", content: "Your Austin personal injury lawyers. Answer a few questions and we'll tell you if we can help — it takes about 2 minutes." },
      ],
    },
    {
      id: "incident_type",
      name: "Incident type",
      type: "question",
      components: [
        {
          id: "q-type",
          type: "singleSelect",
          key: "accident_type",
          label: "What type of accident were you involved in?",
          validation: { required: true },
          options: [
            { label: "Car Accident", value: "car", score: 10 },
            { label: "Truck Accident", value: "truck", score: 20 },
            { label: "Motorcycle Accident", value: "motorcycle", score: 15 },
            { label: "Bicycle Accident", value: "bicycle", score: 10 },
            { label: "Slip & Fall", value: "slip_fall", score: 5 },
            { label: "Brain Injury", value: "brain_injury", score: 25 },
            { label: "Trucking Accident", value: "trucking", score: 20 },
          ],
        },
      ],
    },
    {
      id: "fault",
      name: "Fault",
      type: "question",
      components: [
        {
          id: "q-fault",
          type: "singleSelect",
          key: "at_fault",
          label: "Were you at fault for the accident?",
          helpText: "An honest answer helps us evaluate your case.",
          validation: { required: true },
          options: [
            { label: "No, the other party was at fault", value: "other", score: 20 },
            { label: "Partially", value: "partial", score: 5 },
            { label: "Yes, I was at fault", value: "self", score: -10 },
            { label: "I'm not sure", value: "unsure", score: 0 },
          ],
        },
      ],
    },
    {
      id: "injuries",
      name: "Injuries",
      type: "question",
      components: [
        {
          id: "q-injured",
          type: "singleSelect",
          key: "injured",
          label: "Were you injured in the accident?",
          validation: { required: true },
          options: [
            { label: "Yes", value: "yes", score: 15 },
            { label: "No", value: "no", score: 0 },
          ],
        },
        {
          id: "q-treatment",
          type: "singleSelect",
          key: "sought_treatment",
          label: "Have you received medical treatment?",
          // Only ask when injured — demonstrates conditional components.
          condition: { "==": [{ var: "injured" }, "yes"] },
          options: [
            { label: "Yes", value: "yes", score: 10 },
            { label: "Not yet", value: "no", score: 0 },
          ],
        },
      ],
    },
    {
      id: "represented",
      name: "Representation",
      type: "question",
      components: [
        {
          id: "q-rep",
          type: "singleSelect",
          key: "has_attorney",
          label: "Do you already have an attorney for this accident?",
          validation: { required: true },
          options: [
            { label: "No", value: "no", score: 10 },
            { label: "Yes", value: "yes", score: 0 },
          ],
        },
      ],
    },
    {
      id: "timing",
      name: "Timing",
      type: "question",
      components: [
        {
          id: "q-when",
          type: "date",
          key: "accident_date",
          label: "When did the accident happen?",
          validation: { required: true },
        },
      ],
    },
    {
      id: "contact",
      name: "Contact",
      type: "question",
      components: [
        { id: "c-h", type: "heading", content: "Almost done — how can we reach you?" },
        { id: "c-name", type: "shortText", key: "full_name", label: "Full name", placeholder: "Jane Doe", validation: { required: true } },
        { id: "c-phone", type: "phone", key: "phone", label: "Phone number", placeholder: "(512) 555-0100", validation: { required: true } },
        { id: "c-email", type: "email", key: "email", label: "Email address", placeholder: "you@example.com", validation: { required: true } },
        {
          id: "c-desc",
          type: "longText",
          key: "description",
          label: "Briefly, what happened? (optional)",
          placeholder: "Tell us anything that would help us understand your case.",
        },
      ],
    },
    {
      id: "review",
      name: "Review",
      type: "review",
      components: [
        { id: "r-h", type: "heading", content: "Review your answers" },
        { id: "r-review", type: "review", label: "Please confirm everything looks right." },
      ],
    },
    {
      id: "success",
      name: "Success",
      type: "success",
      components: [
        { id: "s-h", type: "heading", content: "Thank you — we've received your information." },
        { id: "s-p", type: "paragraph", content: "A member of our intake team will reach out shortly. If this is an emergency, please call 911." },
      ],
    },
    {
      id: "decline",
      name: "Not a fit",
      type: "decline",
      components: [
        { id: "d-h", type: "heading", content: "Thanks for reaching out." },
        { id: "d-p", type: "paragraph", content: "Based on your answers, this may not be a case we can take on right now. We appreciate you contacting us and wish you the best." },
      ],
    },
  ],
  scoring: [
    { when: { "==": [{ var: "accident_type" }, "trucking"] }, points: 5, label: "High-value case type" },
  ],
  qualification: {
    // Disqualify: at fault, or already has an attorney. Otherwise route to success.
    rule: {
      and: [
        { "!=": [{ var: "at_fault" }, "self"] },
        { "!=": [{ var: "has_attorney" }, "yes"] },
      ],
    },
    minScore: 20,
    onFailGoTo: "decline",
  },
};
