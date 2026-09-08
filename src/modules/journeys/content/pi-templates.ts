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

// General PI as a branching flow with THREE endings — lead / referral / can't
// help — and full English + Spanish. This is the reference for how a general PI
// flow works: no scoring, the outcome is decided by which ending a branch
// reaches. Edit any text/branch/CTA in the Journey editor.
const general: JourneyTemplate = {
  key: "pi-general",
  name: "General Personal Injury",
  industry: "legal.personal_injury",
  description:
    "Branching flow with three endings — it's a lead, refer out, or can't help. Bilingual (EN/ES), no scoring.",
  definition: {
    schemaVersion: 1,
    name: "General Personal Injury",
    locale: "en",
    languages: ["en", "es"],
    theme: {
      colorBackground: "#ffffff",
      colorSurface: "#ffffff",
      colorText: "#1e3a5f",
      colorAccent: "#1e3a5f",
      radius: "9999px",
      banner: {
        enabled: true,
        items: ["No Fees Unless We Win", "Available 24/7"],
        phone: "+15128838904",
        phoneLabel: "Call Now",
      },
    },
    variables: [],
    pages: [
      {
        id: "welcome",
        name: "Welcome",
        type: "question",
        cta: [{ label: "Call Us Now", type: "call", value: "+15128838904", style: "primary" }],
        components: [
          { id: "gw-h", type: "heading", content: "We're here to help" },
          { id: "gw-p", type: "paragraph", content: "Answer a few quick questions and we'll tell you how we can help." },
          {
            id: "gw-stats",
            type: "stats",
            stats: [
              { value: "200+", label: "Google Reviews", icon: "⭐" },
              { value: "4.9", label: "Average Client Rating" },
              { value: "$50M+", label: "Won for our Clients" },
            ],
          },
          {
            id: "case_type",
            type: "singleSelect",
            key: "case_type",
            validation: { required: true },
            options: [
              { label: "Car Accident", value: "car", goTo: "injured" },
              { label: "Truck Accident", value: "truck", goTo: "injured" },
              { label: "Motorcycle Accident", value: "motorcycle", goTo: "injured" },
              { label: "Pedestrian Accident", value: "pedestrian", goTo: "injured" },
              { label: "Slip & Fall", value: "slip_fall", goTo: "injured" },
              { label: "Dog Bite", value: "dog_bite", goTo: "injured" },
              { label: "Brain Injury", value: "brain_injury", goTo: "injured" },
              { label: "Other", value: "other", goTo: "injured" },
            ],
          },
        ],
      },
      {
        id: "injured",
        name: "Injured",
        type: "question",
        components: [
          {
            id: "g-injured",
            type: "singleSelect",
            key: "injured",
            label: "Were you injured?",
            options: [
              { label: "Yes", value: "yes", goTo: "fault" },
              { label: "No", value: "no", goTo: "cant_help" },
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
            id: "g-fault",
            type: "singleSelect",
            key: "at_fault",
            label: "Were you at fault for what happened?",
            options: [
              { label: "No, someone else was", value: "other", goTo: "represented" },
              { label: "I'm not sure", value: "unsure", goTo: "represented" },
              { label: "Yes, I was at fault", value: "self", goTo: "refer_offer" },
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
            id: "g-rep",
            type: "singleSelect",
            key: "has_attorney",
            label: "Do you already have an attorney for this case?",
            options: [
              { label: "No", value: "no", goTo: "contact" },
              { label: "Yes", value: "yes", goTo: "refer_offer" },
            ],
          },
        ],
      },
      {
        id: "refer_offer",
        name: "Referral offer",
        type: "question",
        components: [
          {
            id: "g-refer",
            type: "singleSelect",
            key: "want_referral",
            label: "We can't take this case, but we can refer you to a trusted attorney. Want a referral?",
            options: [
              { label: "Yes, please", value: "yes", goTo: "referral", markReferral: true },
              { label: "No, thanks", value: "no", goTo: "cant_help" },
            ],
          },
        ],
      },
      {
        id: "contact",
        name: "Contact",
        type: "question",
        components: [
          { id: "gc-h", type: "heading", content: "Almost done — how can we reach you?" },
          { id: "gc-name", type: "shortText", key: "full_name", label: "Full name", validation: { required: true } },
          { id: "gc-phone", type: "phone", key: "phone", label: "Phone number", validation: { required: true } },
          { id: "gc-email", type: "email", key: "email", label: "Email address", validation: { required: true } },
          { id: "gc-desc", type: "longText", key: "description", label: "Briefly, what happened? (optional)" },
        ],
      },
      {
        id: "success",
        name: "It's a lead",
        type: "success",
        cta: [
          { label: "Call Us Now", type: "call", value: "+15128838904", style: "primary" },
          { label: "Explore our firm", type: "link", value: "https://ramosjames.com", style: "secondary" },
        ],
        components: [
          { id: "gs-h", type: "heading", content: "Your case has been submitted!" },
          { id: "gs-p", type: "paragraph", content: "A Ramos James Law team member will reach out shortly." },
        ],
      },
      {
        id: "referral",
        name: "Refer out",
        type: "referral",
        cta: [{ label: "Call Us Now", type: "call", value: "+15128838904", style: "primary" }],
        components: [
          { id: "gr-h", type: "heading", content: "We'll connect you with a trusted attorney." },
          { id: "gr-p", type: "paragraph", content: "Our team will reach out shortly with next steps." },
        ],
      },
      {
        id: "cant_help",
        name: "Can't help",
        type: "decline",
        cta: [{ label: "Call Us Now", type: "call", value: "+15128838904", style: "primary" }],
        components: [
          { id: "gd-h", type: "heading", content: "Thank you for reaching out." },
          { id: "gd-p", type: "paragraph", content: "Please call us if you have any questions." },
        ],
      },
    ],
    scoring: [],
    i18n: {
      es: {
        "c:gw-h:content": "Estamos aquí para ayudar",
        "c:gw-p:content": "Responde unas preguntas rápidas y te diremos cómo podemos ayudar.",
        "o:case_type:car": "Accidente de auto",
        "o:case_type:truck": "Accidente de camión",
        "o:case_type:motorcycle": "Accidente de motocicleta",
        "o:case_type:pedestrian": "Accidente peatonal",
        "o:case_type:slip_fall": "Resbalón y caída",
        "o:case_type:dog_bite": "Mordedura de perro",
        "o:case_type:brain_injury": "Lesión cerebral",
        "o:case_type:other": "Otro",
        "c:g-injured:label": "¿Resultó herido?",
        "o:g-injured:yes": "Sí",
        "o:g-injured:no": "No",
        "c:g-fault:label": "¿Tuvo usted la culpa de lo ocurrido?",
        "o:g-fault:other": "No, la culpa fue de otra persona",
        "o:g-fault:unsure": "No estoy seguro",
        "o:g-fault:self": "Sí, yo tuve la culpa",
        "c:g-rep:label": "¿Ya tiene un abogado para este caso?",
        "o:g-rep:no": "No",
        "o:g-rep:yes": "Sí",
        "c:g-refer:label":
          "No podemos tomar este caso, pero podemos referirte a un abogado de confianza. ¿Quieres una referencia?",
        "o:g-refer:yes": "Sí, por favor",
        "o:g-refer:no": "No, gracias",
        "c:gc-h:content": "Ya casi terminamos, ¿cómo podemos comunicarnos contigo?",
        "c:gc-name:label": "Nombre completo",
        "c:gc-phone:label": "Número de teléfono",
        "c:gc-email:label": "Correo electrónico",
        "c:gc-desc:label": "Cuéntanos brevemente qué pasó (opcional)",
        "c:gs-h:content": "¡Tu caso ha sido enviado!",
        "c:gs-p:content": "Un miembro del equipo de Ramos James Law se pondrá en contacto contigo en breve.",
        "cta:success:0": "Llámanos ahora",
        "cta:success:1": "Conoce nuestra firma",
        "c:gr-h:content": "Te conectaremos con un abogado de confianza.",
        "c:gr-p:content": "Nuestro equipo se comunicará contigo pronto con los siguientes pasos.",
        "cta:referral:0": "Llámanos ahora",
        "c:gd-h:content": "Gracias por comunicarte.",
        "c:gd-p:content": "Llámanos si tienes alguna pregunta.",
        "cta:cant_help:0": "Llámanos ahora",
      },
    },
  },
};

// A minimal lead-capture form — no qualifying questions. It reuses the welcome
// screen's trust styling (stats + banner) but replaces the case-type buttons
// with contact fields, then a second "anything else" page. The click-to-call
// CTA appears at the bottom of both form pages. Bilingual (EN/ES).
const leadForm: JourneyTemplate = {
  key: "pi-lead-form",
  name: "Lead Form",
  industry: "legal.personal_injury",
  description:
    "Simple two-step contact form — name & phone, then what happened. No qualifying questions. Bilingual (EN/ES).",
  definition: {
    schemaVersion: 1,
    name: "Lead Form",
    locale: "en",
    languages: ["en", "es"],
    theme: {
      colorBackground: "#ffffff",
      colorSurface: "#ffffff",
      colorText: "#1e3a5f",
      colorAccent: "#1e3a5f",
      radius: "9999px",
      banner: {
        enabled: true,
        items: ["No Fees Unless We Win", "Available 24/7"],
        phone: "+15128838904",
        phoneLabel: "Call Now",
      },
      callback: {
        enabled: true,
        heading: "Prefer a quick callback? Leave your information.",
        buttonLabel: "Request callback",
        buttonSubtitle: "We'll reach out shortly",
        secureText: "Your information is secure and will never be shared.",
      },
    },
    variables: [],
    pages: [
      {
        // Landing: two big choices — call now, or start online. On desktop a
        // quick contact form also appears below ("or leave your information").
        // On mobile the form is hidden; "Start Online" opens the guided form.
        id: "welcome",
        name: "Start",
        type: "question",
        continueLabel: "Start My Free Consultation",
        continueSubtitle: "Takes about 2 minutes",
        cta: [
          {
            label: "Call Now",
            subtitle: "Speak with our team now",
            note: "Available 24/7",
            type: "call",
            value: "+15128838904",
            style: "primary",
          },
        ],
        components: [
          { id: "lf-h", type: "heading", content: "Injured in an accident?\nWe're ready to help." },
          { id: "lf-p", type: "paragraph", content: "Talk to us now, or start a quick 2-minute consultation online." },
          {
            id: "lf-stats",
            type: "stats",
            stats: [
              { value: "4.9", label: "Google Rating", icon: "⭐" },
              { value: "200+", label: "5-Star Reviews" },
              { value: "$50M+", label: "Recovered" },
            ],
          },
        ],
      },
      {
        // The guided contact form. Skipped when the desktop landing form was
        // already filled (so desktop submits in one step).
        id: "contact",
        name: "Your info",
        type: "question",
        continueLabel: "Submit",
        condition: { empty: { var: "full_name" } },
        cta: [{ label: "Call Now", type: "call", value: "+15128838904", style: "primary" }],
        components: [
          { id: "c-h", type: "heading", content: "How can we reach you?" },
          { id: "c-p", type: "paragraph", content: "We'll review your case and reach out shortly." },
          { id: "c-name", type: "shortText", key: "full_name", label: "Full name", placeholder: "Jane Doe", validation: { required: true } },
          { id: "c-phone", type: "phone", key: "phone", label: "Phone number", placeholder: "(512) 555-0100", validation: { required: true } },
          { id: "c-email", type: "email", key: "email", label: "Email address", placeholder: "you@example.com", validation: { required: true } },
          { id: "c-desc", type: "longText", key: "description", label: "Briefly, what happened? (optional)" },
        ],
      },
      {
        id: "success",
        name: "Thank you",
        type: "success",
        cta: [
          { label: "Call Now — Free Consultation", type: "call", value: "+15128838904", style: "primary" },
          { label: "Explore our firm", type: "link", value: "https://ramosjames.com", style: "secondary" },
        ],
        components: [
          { id: "lf-s-h", type: "heading", content: "Thank you — we've got your information." },
          { id: "lf-s-p", type: "paragraph", content: "A Ramos James Law team member will reach out shortly." },
        ],
      },
    ],
    scoring: [],
    i18n: {
      es: {
        "c:lf-h:content": "¿Lesionado en un accidente?\nEstamos listos para ayudar.",
        "c:lf-p:content": "Habla con nosotros ahora, o comienza una consulta rápida de 2 minutos en línea.",
        "callback:heading": "¿Prefieres que te llamemos? Deja tu información.",
        "callback:button": "Solicitar llamada",
        "callback:button:sub": "Nos comunicaremos en breve",
        "callback:secure": "Tu información es segura y nunca será compartida.",
        "p:welcome:continue": "Comenzar mi consulta gratis",
        "p:welcome:continue:sub": "Toma unos 2 minutos",
        "cta:welcome:0": "Llamar ahora",
        "cta:welcome:0:sub": "Habla con nuestro equipo ahora",
        "cta:welcome:0:note": "Disponible 24/7",
        "c:c-h:content": "¿Cómo podemos comunicarnos contigo?",
        "c:c-p:content": "Revisaremos tu caso y nos comunicaremos contigo en breve.",
        "c:c-name:label": "Nombre completo",
        "c:c-phone:label": "Número de teléfono",
        "c:c-email:label": "Correo electrónico",
        "c:c-desc:label": "Cuéntanos brevemente qué pasó (opcional)",
        "p:contact:continue": "Enviar",
        "cta:contact:0": "Llamar ahora",
        "c:lf-s-h:content": "Gracias, hemos recibido tu información.",
        "c:lf-s-p:content": "Un miembro del equipo de Ramos James Law se pondrá en contacto contigo en breve.",
        "cta:success:0": "Llamar ahora — Consulta gratis",
        "cta:success:1": "Conoce nuestra firma",
      },
    },
  },
};

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

// A branching, no-scoring flow (Landbot-style). Click a case type → auto-advance
// → reach a call-to-action ending. Demonstrates per-option branching, endings
// with a "Call now" button, and light-theme branding (add your logo & side
// image in the editor).
const guidedFlow: JourneyTemplate = {
  key: "pi-guided-flow",
  name: "Guided Intake (branching)",
  industry: "legal.personal_injury",
  description:
    "Click a case type, answer a couple questions, land on a call-to-action ending. Pure branching — no scoring.",
  definition: {
    schemaVersion: 1,
    name: "Guided Intake",
    locale: "en",
    theme: {
      colorBackground: "#ffffff",
      colorSurface: "#ffffff",
      colorText: "#1e3a5f",
      colorAccent: "#1e3a5f",
      radius: "9999px",
    },
    variables: [],
    pages: [
      {
        id: "welcome",
        name: "Welcome",
        type: "question",
        components: [
          { id: "w-h", type: "heading", content: "We're here to help" },
          {
            id: "w-p",
            type: "paragraph",
            content: "Let us fight for your legal rights while you focus on recovery. Please choose an option below.",
          },
          {
            id: "case",
            type: "singleSelect",
            key: "case_type",
            validation: { required: true },
            options: [
              { label: "Bicycle Accidents", value: "bicycle", goTo: "contact" },
              { label: "Brain Injury", value: "brain", goTo: "contact" },
              { label: "Burn Injuries", value: "burn", goTo: "contact" },
              { label: "Car Accidents", value: "car", goTo: "car_fault" },
              { label: "Catastrophic Injuries", value: "catastrophic", goTo: "contact" },
              { label: "Dog Bites", value: "dog_bite", goTo: "contact" },
              { label: "Motorcycle Accidents", value: "motorcycle", goTo: "contact" },
              { label: "Pedestrian Accidents", value: "pedestrian", goTo: "contact" },
              { label: "Premises Liability", value: "premises", goTo: "contact" },
              { label: "Slip & Fall", value: "slip_fall", goTo: "contact" },
              { label: "Spinal Cord Injuries", value: "spinal", goTo: "contact" },
              { label: "Trucking Accidents", value: "trucking", goTo: "contact" },
            ],
          },
        ],
      },
      {
        id: "car_fault",
        name: "Fault",
        type: "question",
        components: [
          {
            id: "cf",
            type: "singleSelect",
            key: "at_fault",
            label: "Were you at fault for the accident?",
            options: [
              { label: "No, someone else was", value: "other", goTo: "contact" },
              { label: "I'm not sure", value: "unsure", goTo: "contact" },
              { label: "Yes, I was at fault", value: "self", goTo: "not_fit" },
            ],
          },
        ],
      },
      {
        id: "contact",
        name: "Contact",
        type: "question",
        components: [
          { id: "c-h", type: "heading", content: "Almost done — how can we reach you?" },
          { id: "c-name", type: "shortText", key: "full_name", label: "Full name", validation: { required: true } },
          { id: "c-phone", type: "phone", key: "phone", label: "Phone number", validation: { required: true } },
          { id: "c-email", type: "email", key: "email", label: "Email address", validation: { required: true } },
          { id: "c-desc", type: "longText", key: "description", label: "Briefly, what happened? (optional)" },
        ],
      },
      {
        id: "submitted",
        name: "Submitted",
        type: "end",
        cta: [
          { label: "Call now", href: "tel:+15125550100", style: "primary" },
          { label: "Explore our firm", href: "https://ramosjames.com", style: "secondary" },
        ],
        components: [
          { id: "s-h", type: "heading", content: "Your case has been submitted!" },
          { id: "s-p", type: "paragraph", content: "We will review your case and be in touch soon!" },
        ],
      },
      {
        id: "not_fit",
        name: "Not a fit",
        type: "end",
        cta: [{ label: "Explore our firm", href: "https://ramosjames.com", style: "secondary" }],
        components: [
          { id: "n-h", type: "heading", content: "Thank you for reaching out." },
          {
            id: "n-p",
            type: "paragraph",
            content: "Based on your answer, this may not be a case we're able to take on. We wish you the best.",
          },
        ],
      },
    ],
    scoring: [],
  },
};

// Ordered for the New Journey picker.
export const piTemplates: JourneyTemplate[] = [
  guidedFlow,
  general,
  leadForm,
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
