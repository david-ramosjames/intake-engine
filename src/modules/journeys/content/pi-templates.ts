// =============================================================================
// Personal Injury journey templates (Ramos James Law)
// -----------------------------------------------------------------------------
// One qualifying intake per case type, built from a small factory of shared
// blocks (injury/treatment, representation, timing, contact, review, success,
// decline) plus incident-specific questions and scoring. All are plain
// configuration — no engine changes. Edit any of them in the Journey editor.
// =============================================================================

import type { Expression } from "../domain/expression";
import type { JourneyDefinition, Option, Page } from "../domain/schema";
import { carAccidentJourney } from "./pi-car-accident";
import type { JourneyTemplate } from "./templates";

const PI_THEME = {
  colorBackground: "#0b1f3a",
  colorSurface: "#12294b",
  colorText: "#ffffff",
  colorPrimary: "#ffffff",
  colorOnPrimary: "#0b1f3a",
  colorAccent: "#e63946",
  radius: "9999px",
} as const;

type ScoringRule = { when: Expression; points: number; label?: string };

// --- Shared blocks ----------------------------------------------------------

function welcomePage(intro: string): Page {
  return {
    id: "welcome",
    name: "Welcome",
    type: "statement",
    components: [
      { id: "w-h", type: "heading", content: "Ramos James Law" },
      { id: "w-p", type: "paragraph", content: intro },
    ],
  };
}

// A reusable single-select question page.
function choice(
  id: string,
  key: string,
  label: string,
  options: Option[],
  opts: { helpText?: string; required?: boolean } = {},
): Page {
  return {
    id,
    name: label.slice(0, 40),
    type: "question",
    components: [
      {
        id: `q-${key}`,
        type: "singleSelect",
        key,
        label,
        helpText: opts.helpText,
        validation: { required: opts.required ?? true },
        options,
      },
    ],
  };
}

// The classic fault/liability question, reused across vehicle-type cases.
function faultPage(): Page {
  return choice(
    "fault",
    "at_fault",
    "Were you at fault for what happened?",
    [
      { label: "No, someone else was at fault", value: "other", score: 20 },
      { label: "Partially", value: "partial", score: 5 },
      { label: "Yes, I was at fault", value: "self", score: -10 },
      { label: "I'm not sure", value: "unsure", score: 0 },
    ],
    { helpText: "An honest answer helps us evaluate your case." },
  );
}

function injuryPage(): Page {
  return {
    id: "injuries",
    name: "Injuries",
    type: "question",
    components: [
      {
        id: "q-injured",
        type: "singleSelect",
        key: "injured",
        label: "Were you injured?",
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
        condition: { "==": [{ var: "injured" }, "yes"] },
        options: [
          { label: "Yes", value: "yes", score: 10 },
          { label: "Not yet", value: "no", score: 0 },
        ],
      },
    ],
  };
}

function representationPage(): Page {
  return choice("representation", "has_attorney", "Do you already have an attorney for this matter?", [
    { label: "No", value: "no", score: 10 },
    { label: "Yes", value: "yes", score: 0 },
  ]);
}

function timingPage(label = "When did this happen?"): Page {
  return {
    id: "timing",
    name: "Timing",
    type: "question",
    components: [{ id: "q-when", type: "date", key: "incident_date", label, validation: { required: true } }],
  };
}

function contactPage(prompt: string): Page {
  return {
    id: "contact",
    name: "Contact",
    type: "question",
    components: [
      { id: "c-h", type: "heading", content: "Almost done — how can we reach you?" },
      { id: "c-name", type: "shortText", key: "full_name", label: "Full name", placeholder: "Jane Doe", validation: { required: true } },
      { id: "c-phone", type: "phone", key: "phone", label: "Phone number", placeholder: "(512) 555-0100", validation: { required: true } },
      { id: "c-email", type: "email", key: "email", label: "Email address", placeholder: "you@example.com", validation: { required: true } },
      { id: "c-desc", type: "longText", key: "description", label: prompt },
    ],
  };
}

function reviewPage(): Page {
  return {
    id: "review",
    name: "Review",
    type: "review",
    components: [
      { id: "r-h", type: "heading", content: "Review your answers" },
      { id: "r-review", type: "review", label: "Please confirm everything looks right." },
    ],
  };
}

function successPage(msg: string): Page {
  return {
    id: "success",
    name: "Success",
    type: "success",
    components: [
      { id: "s-h", type: "heading", content: "Thank you — we've received your information." },
      { id: "s-p", type: "paragraph", content: msg },
    ],
  };
}

function declinePage(msg: string): Page {
  return {
    id: "decline",
    name: "Not a fit",
    type: "decline",
    components: [
      { id: "d-h", type: "heading", content: "Thank you for reaching out." },
      { id: "d-p", type: "paragraph", content: msg },
    ],
  };
}

const DEFAULT_SUCCESS =
  "A member of our intake team will reach out shortly. If this is an emergency, please call 911.";
const DEFAULT_DECLINE =
  "Based on your answers, this may not be a case we're able to take on right now. We appreciate you contacting us and wish you the best.";

function and(...conds: Array<Expression | undefined>): Expression | undefined {
  const xs = conds.filter((c): c is Expression => c !== undefined);
  if (xs.length === 0) return undefined;
  if (xs.length === 1) return xs[0];
  return { and: xs };
}

// --- Factory ----------------------------------------------------------------

interface PiSpec {
  key: string;
  name: string;
  description: string;
  intro: string;
  incidentPages: Page[];
  injury?: boolean; // default true
  timing?: boolean; // default true
  representation?: boolean; // default true
  timingLabel?: string;
  qualificationRule?: Expression;
  minScore?: number;
  extraScoring?: ScoringRule[];
  contactPrompt?: string;
  successMessage?: string;
  declineMessage?: string;
}

function buildPiTemplate(spec: PiSpec): JourneyTemplate {
  const representation = spec.representation !== false;
  const pages: Page[] = [
    welcomePage(spec.intro),
    ...spec.incidentPages,
    ...(spec.injury === false ? [] : [injuryPage()]),
    ...(representation ? [representationPage()] : []),
    ...(spec.timing === false ? [] : [timingPage(spec.timingLabel)]),
    contactPage(spec.contactPrompt ?? "Briefly, what happened? (optional)"),
    reviewPage(),
    successPage(spec.successMessage ?? DEFAULT_SUCCESS),
    declinePage(spec.declineMessage ?? DEFAULT_DECLINE),
  ];

  const rule = and(
    representation ? { "!=": [{ var: "has_attorney" }, "yes"] } : undefined,
    spec.qualificationRule,
  );
  const qualification =
    rule !== undefined || spec.minScore !== undefined
      ? { rule, minScore: spec.minScore, onFailGoTo: "decline" }
      : undefined;

  const definition: JourneyDefinition = {
    schemaVersion: 1,
    name: spec.name,
    locale: "en",
    theme: PI_THEME,
    variables: [],
    pages,
    scoring: spec.extraScoring ?? [],
    qualification,
  };

  return {
    key: spec.key,
    name: spec.name,
    industry: "legal.personal_injury",
    description: spec.description,
    definition,
  };
}

// --- Templates --------------------------------------------------------------

const general = buildPiTemplate({
  key: "pi-general",
  name: "General Personal Injury",
  description: "Catch-all intake that routes by incident type, with fault, injury & representation checks.",
  intro:
    "Your Austin personal injury lawyers. Answer a few questions and we'll tell you if we can help — it takes about 2 minutes.",
  incidentPages: [
    choice("incident", "incident_type", "What type of incident were you involved in?", [
      { label: "Car accident", value: "car", score: 10 },
      { label: "Truck accident", value: "truck", score: 20 },
      { label: "Motorcycle accident", value: "motorcycle", score: 15 },
      { label: "Pedestrian accident", value: "pedestrian", score: 15 },
      { label: "Rideshare (Uber/Lyft)", value: "rideshare", score: 12 },
      { label: "Slip & fall", value: "slip_fall", score: 8 },
      { label: "Dog bite", value: "dog_bite", score: 8 },
      { label: "Workplace injury", value: "workplace", score: 10 },
      { label: "Brain injury", value: "brain_injury", score: 25 },
      { label: "Other", value: "other", score: 5 },
    ]),
    faultPage(),
  ],
  qualificationRule: { "!=": [{ var: "at_fault" }, "self"] },
  minScore: 20,
});

const car: JourneyTemplate = {
  key: "pi-car-accident",
  name: "Car Accidents",
  industry: "legal.personal_injury",
  description: "Qualifying intake for car accident leads with scoring & decline logic.",
  definition: carAccidentJourney,
};

const truck = buildPiTemplate({
  key: "pi-truck",
  name: "Truck Accidents",
  description: "Commercial-truck collision intake — vehicle type, fault, and injuries.",
  intro:
    "Injured in a crash with a commercial truck? Truck cases can involve significant injuries and multiple responsible parties. Let's see how we can help.",
  incidentPages: [
    choice("truck_kind", "truck_type", "What kind of truck was involved?", [
      { label: "18-wheeler / semi", value: "semi", score: 20 },
      { label: "Delivery truck", value: "delivery", score: 15 },
      { label: "Company / commercial vehicle", value: "commercial", score: 15 },
      { label: "Other large truck", value: "other", score: 10 },
    ]),
    faultPage(),
  ],
  qualificationRule: { "!=": [{ var: "at_fault" }, "self"] },
  minScore: 20,
});

const pedestrian = buildPiTemplate({
  key: "pi-pedestrian",
  name: "Pedestrian Accidents",
  description: "For people struck by a vehicle while walking — right of way and injuries.",
  intro:
    "Were you hit by a vehicle while walking? Pedestrians often have strong claims. Answer a few quick questions.",
  incidentPages: [
    choice("row", "right_of_way", "Did you have the right of way (e.g., in a crosswalk or on a sidewalk)?", [
      { label: "Yes", value: "yes", score: 20 },
      { label: "No", value: "no", score: 5 },
      { label: "Not sure", value: "unsure", score: 10 },
    ]),
  ],
  minScore: 20,
});

const drunkDriver = buildPiTemplate({
  key: "pi-drunk-driver",
  name: "Drunk Driver Victims",
  description: "For victims of impaired drivers — DUI charges can add punitive value.",
  intro:
    "Hurt by a drunk or impaired driver? You may be entitled to significant compensation. Let's review your case.",
  incidentPages: [
    choice("dui", "dui_charged", "Was the other driver arrested or charged with DUI/DWI?", [
      { label: "Yes", value: "yes", score: 25 },
      { label: "No", value: "no", score: 5 },
      { label: "Not sure", value: "unsure", score: 10 },
    ]),
    faultPage(),
  ],
  qualificationRule: { "!=": [{ var: "at_fault" }, "self"] },
  minScore: 20,
});

const rideshare = buildPiTemplate({
  key: "pi-rideshare",
  name: "Rideshare Accidents",
  description: "Uber/Lyft crashes — captures your role and the service involved.",
  intro:
    "In a crash involving an Uber or Lyft? Rideshare cases have special insurance rules. Tell us what happened.",
  incidentPages: [
    choice("role", "rideshare_role", "In the accident, were you a...", [
      { label: "Passenger in the rideshare", value: "passenger", score: 20 },
      { label: "Driver of the rideshare", value: "driver", score: 12 },
      { label: "In another vehicle", value: "other_vehicle", score: 12 },
      { label: "Pedestrian or cyclist", value: "pedestrian", score: 15 },
    ]),
    choice(
      "service",
      "rideshare_service",
      "Which service was involved?",
      [
        { label: "Uber", value: "uber" },
        { label: "Lyft", value: "lyft" },
        { label: "Other", value: "other" },
      ],
      { required: false },
    ),
    faultPage(),
  ],
  qualificationRule: { "!=": [{ var: "at_fault" }, "self"] },
  minScore: 20,
});

const slipFall = buildPiTemplate({
  key: "pi-slip-fall",
  name: "Slip and Fall",
  description: "Premises-liability intake — where it happened and whether a hazard was present.",
  intro:
    "Injured in a slip, trip, or fall on someone else's property? Property owners have a duty to keep you safe. Let's take a look.",
  incidentPages: [
    choice("location", "location_type", "Where did the fall happen?", [
      { label: "Store or business", value: "business", score: 20 },
      { label: "Restaurant or bar", value: "restaurant", score: 18 },
      { label: "Apartment complex", value: "apartment", score: 15 },
      { label: "Public property", value: "public", score: 12 },
      { label: "Private home", value: "private_home", score: 5 },
    ]),
    choice("hazard", "hazard", "Was there a hazard that caused the fall (wet floor, uneven ground, poor lighting, etc.)?", [
      { label: "Yes", value: "yes", score: 15 },
      { label: "No / not sure", value: "no", score: 0 },
    ]),
  ],
  qualificationRule: { "==": [{ var: "hazard" }, "yes"] },
  minScore: 20,
});

const workplace = buildPiTemplate({
  key: "pi-workplace",
  name: "Workplace Injuries",
  description: "Work injuries — screens for third-party liability beyond workers' comp.",
  intro:
    "Hurt on the job? Beyond workers' comp, a third party may also be responsible. Answer a few questions and we'll evaluate your options.",
  incidentPages: [
    choice("thirdparty", "third_party", "Was anyone other than your employer involved (equipment maker, subcontractor, property owner, etc.)?", [
      { label: "Yes", value: "yes", score: 20 },
      { label: "No", value: "no", score: 5 },
      { label: "Not sure", value: "unsure", score: 10 },
    ]),
    choice(
      "wc",
      "workers_comp",
      "Have you filed a workers' compensation claim?",
      [
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" },
        { label: "Not sure", value: "unsure" },
      ],
      { required: false },
    ),
  ],
  minScore: 15,
});

const brainInjury = buildPiTemplate({
  key: "pi-brain-injury",
  name: "Brain Injuries",
  description: "Traumatic brain injury intake — cause, responsibility, and diagnosis.",
  intro:
    "Traumatic brain injuries can have lasting effects and significant value. Tell us what happened so we can help.",
  injury: false,
  incidentPages: [
    choice("cause", "brain_cause", "How did the brain injury happen?", [
      { label: "Car or truck accident", value: "vehicle", score: 20 },
      { label: "Fall", value: "fall", score: 15 },
      { label: "Assault", value: "assault", score: 15 },
      { label: "Workplace", value: "workplace", score: 15 },
      { label: "Sports / recreation", value: "sports", score: 10 },
      { label: "Medical", value: "medical", score: 15 },
      { label: "Other", value: "other", score: 10 },
    ]),
    choice("responsible", "someone_responsible", "Was someone else responsible?", [
      { label: "Yes", value: "yes", score: 20 },
      { label: "No", value: "no", score: -10 },
      { label: "Not sure", value: "unsure", score: 5 },
    ]),
    choice("diagnosed", "diagnosed", "Has the injury been diagnosed by a doctor?", [
      { label: "Yes", value: "yes", score: 15 },
      { label: "Not yet", value: "no", score: 0 },
    ]),
  ],
  qualificationRule: { "!=": [{ var: "someone_responsible" }, "no"] },
  minScore: 20,
});

const dogBite = buildPiTemplate({
  key: "pi-dog-bite",
  name: "Dog Bite",
  description: "Dog attack intake — owner identification and injury severity.",
  intro:
    "Bitten or attacked by a dog? Owners can be held responsible for injuries. Answer a few quick questions.",
  injury: false,
  incidentPages: [
    choice("owner", "knows_owner", "Do you know who owns the dog?", [
      { label: "Yes", value: "yes", score: 15 },
      { label: "No", value: "no", score: 0 },
      { label: "It was a stray", value: "stray", score: 0 },
    ]),
    choice("severity", "bite_severity", "How serious was the injury?", [
      { label: "Required medical treatment, stitches, or surgery", value: "serious", score: 20 },
      { label: "Broke the skin", value: "moderate", score: 12 },
      { label: "Minor", value: "minor", score: 3 },
    ]),
  ],
  minScore: 15,
});

const sexualAssault = buildPiTemplate({
  key: "pi-sexual-assault",
  name: "Sexual Assault",
  description: "Confidential, trauma-informed civil intake focused on third-party liability.",
  intro:
    "You are not alone, and this is completely confidential. We handle these cases with care and discretion. Please share only what you're comfortable sharing — there is no obligation.",
  injury: false,
  timingLabel: "Approximately when did this happen?",
  incidentPages: [
    choice(
      "premises",
      "third_party_liability",
      "Did this happen somewhere an organization may share responsibility (hotel, rideshare, apartment, workplace, school, or care facility)?",
      [
        { label: "Yes", value: "yes", score: 20 },
        { label: "No", value: "no", score: 5 },
        { label: "Not sure", value: "unsure", score: 10 },
      ],
    ),
    choice(
      "reported",
      "reported",
      "Have you reported the incident to anyone (police, employer, school, etc.)?",
      [
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" },
        { label: "Prefer not to say", value: "no_answer" },
      ],
      { required: false },
    ),
  ],
  contactPrompt: "Share anything you're comfortable telling us. (optional)",
  successMessage:
    "Thank you for trusting us with this. A member of our team will reach out privately and with care. If you are in immediate danger, please call 911.",
  declineMessage:
    "Thank you for reaching out. It looks like you may already have representation. We're grateful you contacted us and we wish you healing and support.",
});

const wrongfulDeath = buildPiTemplate({
  key: "pi-wrongful-death",
  name: "Wrongful Death",
  description: "Compassionate intake for families — cause, responsibility, and relationship.",
  intro:
    "We're so sorry for your loss. We're here to help you understand your options with compassion and no pressure. This is confidential, and there is no obligation.",
  injury: false,
  timingLabel: "Approximately when did your loved one pass?",
  incidentPages: [
    choice("cause", "death_cause", "What caused your loved one's death?", [
      { label: "Car or truck accident", value: "vehicle", score: 20 },
      { label: "Workplace incident", value: "workplace", score: 18 },
      { label: "Medical negligence", value: "medical", score: 18 },
      { label: "Defective product", value: "product", score: 18 },
      { label: "Violence or assault", value: "violence", score: 15 },
      { label: "Other", value: "other", score: 10 },
    ]),
    choice("responsible", "someone_responsible", "Do you believe someone else was responsible?", [
      { label: "Yes", value: "yes", score: 25 },
      { label: "No", value: "no", score: -10 },
      { label: "Not sure", value: "unsure", score: 10 },
    ]),
    choice("relationship", "relationship", "What was your relationship to your loved one?", [
      { label: "Spouse", value: "spouse", score: 10 },
      { label: "Child", value: "child", score: 10 },
      { label: "Parent", value: "parent", score: 10 },
      { label: "Sibling", value: "sibling", score: 5 },
      { label: "Other family", value: "other", score: 3 },
    ]),
  ],
  qualificationRule: { "!=": [{ var: "someone_responsible" }, "no"] },
  minScore: 20,
  contactPrompt: "Please share anything that would help us understand what happened. (optional)",
  successMessage:
    "Thank you for sharing this with us. A member of our team will reach out personally, with care and respect for what you're going through.",
  declineMessage:
    "Thank you for reaching out during such a difficult time. It looks like you may already have representation. We're grateful you contacted us and we're so sorry for your loss.",
});

// Ordered for the New Journey picker.
export const piTemplates: JourneyTemplate[] = [
  general,
  car,
  truck,
  pedestrian,
  drunkDriver,
  rideshare,
  slipFall,
  workplace,
  brainInjury,
  dogBite,
  sexualAssault,
  wrongfulDeath,
];
