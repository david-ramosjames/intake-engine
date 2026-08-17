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
  "stats",
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
  // Optional second line under the label, and a small pill on the right (e.g.
  // "Available 24/7"). When set, the button renders in the richer icon layout.
  subtitle: z.string().optional(),
  note: z.string().optional(),
  // How to interpret `value`: phone for call/text; URL for schedule/link/custom.
  type: z.enum(["call", "text", "schedule", "link", "custom"]).optional(),
  value: z.string().optional(),
  // Explicit href overrides type+value when present (legacy/back-compat).
  href: z.string().optional(),
  style: z.enum(["primary", "secondary"]).default("primary"),
});
export type Cta = z.infer<typeof ctaSchema>;

/**
 * Normalize a phone number to E.164 digits for tel:/sms: links (e.g.
 * "(512) 537-3369" → "+15125373369"). A bare 10-digit US number gets +1; an
 * 11-digit number starting with 1 gets a +; anything already starting with +
 * is kept. This is the form CallRail and dialers expect.
 */
export function telDigits(raw: string): string {
  const cleaned = (raw ?? "").replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  const d = cleaned.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return d;
}

/** Resolve the actual href for a CTA from its type/value (or explicit href). */
export function ctaHref(cta: Cta): string {
  if (cta.href) return cta.href;
  const v = (cta.value ?? "").trim();
  if (cta.type === "call") return `tel:${telDigits(v)}`;
  if (cta.type === "text") return `sms:${telDigits(v)}`;
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

// A single trust figure, e.g. { value: "$50M+", label: "Won for our Clients" }.
export const statItemSchema = z.object({
  value: z.string(),
  label: z.string(),
  icon: z.string().optional(), // emoji or short glyph
});
export type StatItem = z.infer<typeof statItemSchema>;

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
  // Trust-bar figures (type "stats"). Numbers count up on load.
  stats: z.array(statItemSchema).optional(),
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
  // "convert": a success-style milestone that submits the lead (fires CallRail /
  // GA) but is NOT terminal — the flow continues to more questions.
  "convert",
  // "sign": a terminal step that sends the visitor to sign a contract (DocuSeal).
  "sign",
]);
export type PageType = z.infer<typeof pageType>;

/** The lead outcome recorded when a flow reaches a given ending type. */
export function outcomeForPageType(type: PageType): "lead" | "referral" | "declined" | null {
  if (type === "success" || type === "end" || type === "convert" || type === "sign") return "lead";
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
  // Custom label (and optional second line) for the primary advance button.
  continueLabel: z.string().optional(),
  continueSubtitle: z.string().optional(),
  // Page-level visibility: skip entirely when false.
  condition: expressionSchema.optional(),
  // Conditional branching evaluated in order; first match wins. When none
  // match, advance to the next visible page.
  next: z.array(navigationRuleSchema).optional(),
  // Unconditional Continue-button destination. Used when a page has no per-
  // option branching (e.g. an open-ended answer): the Continue button jumps
  // here. Conditional `next` rules still take precedence when they match.
  advanceTo: z.string().optional(),
  // Marks this screen as the conversion point: submit the lead (firing
  // CallRail / Slack / GA) when the visitor completes it and continues to the
  // next screen. Use it on the screen that captures contact info when the flow
  // has no "convert" milestone. The submit is guarded to run once per session,
  // so a later terminal screen won't fire it a second time.
  submitLeadOnAdvance: z.boolean().optional(),
  // Call-to-action buttons, shown on terminal/ending screens (call, website…).
  cta: z.array(ctaSchema).optional(),
  // Signing config for a "sign" page. `url` is a DocuSeal link/embed to open
  // directly; when the org has DocuSeal API credentials + `templateId`, the
  // server instead creates a submission pre-filled from the lead's answers and
  // uses that. `mode` controls how it opens.
  signing: z
    .object({
      mode: z.enum(["embed", "redirect", "newtab"]).default("embed"),
      // Static DocuSeal link (fallback / no prefill). When DocuSeal template ids
      // are set below, the server instead creates a pre-filled submission via
      // Sign Flow and uses that URL.
      url: z.string().optional(),
      // DocuSeal template ids per language (contracts differ EN vs ES). The
      // journey's current locale selects which one is used.
      templateIdEn: z.string().optional(),
      templateIdEs: z.string().optional(),
      // Answer key holding the date of loss (a Date field → yyyy-MM-dd), passed
      // to the contract. Defaults to auto-detecting the first Date question.
      dateOfLossKey: z.string().optional(),
      buttonLabel: z.string().optional(),
    })
    .optional(),
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
    // The two action buttons on landing/ending screens get their own colors:
    //   primary  = the filled call button (fill + text)
    //   secondary = the outlined "start" button (border + text)
    ctaPrimaryBg: z.string().optional(),
    ctaPrimaryText: z.string().optional(),
    ctaSecondaryColor: z.string().optional(),
    // The outlined "start" button fills on hover. By default it fills with its
    // own border color; set these to specify the hover fill and text.
    ctaSecondaryHoverBg: z.string().optional(),
    ctaSecondaryHoverText: z.string().optional(),
    // Branding: a logo shown at the top, and an optional side/hero image shown
    // on the left on desktop. `logoLink` makes the logo clickable.
    logoUrl: z.string().optional(),
    logoLink: z.string().optional(),
    sideImageUrl: z.string().optional(),
    // Dedicated image for link/social previews (ideally a public 1200×630 URL).
    // Falls back to the hero photo, then the logo, when unset.
    socialImageUrl: z.string().optional(),
    // How the hero photo is framed: CSS background-position (e.g. "70% 60%")
    // and a zoom multiplier (1 = fit, 1.3 = zoomed in 30%). These apply to the
    // MOBILE hero. The desktop side image is framed separately below so tuning
    // the phone crop never shifts the desktop photo.
    heroPosition: z.string().optional(),
    heroScale: z.number().optional(),
    // Desktop side-image framing (independent of the mobile hero). When unset
    // the desktop photo uses a neutral centered crop.
    heroPositionDesktop: z.string().optional(),
    heroScaleDesktop: z.number().optional(),
    // Vertical position of the attorney name/title over the MOBILE hero, as a
    // percent from the top (0 = top, higher = lower — set high to sit just
    // above the headline). Defaults to 22.
    heroNameYMobile: z.number().optional(),
    // Desktop-only "quick callback" card shown under the action buttons: a
    // labeled divider, a compact contact form, a submit button, and a secure
    // footer line. Text is optional (sensible defaults are used).
    callback: z
      .object({
        // Turn the card on. When on and the landing screen has no explicit
        // "below" fields, a default name/phone/email/message set is shown.
        enabled: z.boolean().optional(),
        heading: z.string().optional(),
        buttonLabel: z.string().optional(),
        buttonSubtitle: z.string().optional(),
        secureText: z.string().optional(),
        // "Request callback" button styling. Defaults: accent background, white
        // text, no border.
        buttonBg: z.string().optional(),
        buttonText: z.string().optional(),
        buttonBorderColor: z.string().optional(),
        // "Active" styling applied once any callback field has text — a cue that
        // the visitor has started. Each falls back to its resting counterpart.
        buttonActiveBg: z.string().optional(),
        buttonActiveText: z.string().optional(),
        buttonActiveBorderColor: z.string().optional(),
      })
      .optional(),
    // Optional content BELOW the fold on the landing screen. It does not affect
    // the above-the-fold layout (which is sized to fill the screen); visitors
    // scroll down to reach it.
    faq: z
      .object({
        enabled: z.boolean().optional(),
        // When set, the FAQ content comes from a reusable FAQ set in the org's
        // library (resolved at render time) instead of the inline items below.
        setId: z.string().optional(),
        heading: z.string().optional(),
        // Spanish heading/disclaimer, used when a resolved FAQ set carries them.
        headingEs: z.string().optional(),
        items: z
          .array(z.object({ q: z.string(), a: z.string(), qEs: z.string().optional(), aEs: z.string().optional() }))
          .optional(),
        // Small print shown under the questions (e.g. a legal disclaimer).
        disclaimer: z.string().optional(),
        disclaimerEs: z.string().optional(),
      })
      .optional(),
    // A below-the-fold content/paragraph section (heading + body copy). Like the
    // FAQ block, the content can come from a reusable content block in the org's
    // library (resolved at render time) via setId, or be inline per-journey.
    content: z
      .object({
        enabled: z.boolean().optional(),
        setId: z.string().optional(),
        heading: z.string().optional(),
        headingEs: z.string().optional(),
        body: z.string().optional(),
        bodyEs: z.string().optional(),
      })
      .optional(),
    reviews: z
      .object({
        enabled: z.boolean().optional(),
        heading: z.string().optional(),
        // Auto-advance interval in seconds (default 10).
        intervalSeconds: z.number().optional(),
        items: z
          .array(
            z.object({
              name: z.string(),
              text: z.string(),
              rating: z.number().optional(),
              source: z.string().optional(), // e.g. "Google"
            }),
          )
          .optional(),
      })
      .optional(),
    // Shared controls for the below-the-fold area: section order and an
    // optional repeat of the Call / Start buttons at the very bottom.
    belowFold: z
      .object({
        // Order the below-the-fold sections render in — a permutation of
        // "content", "faq", "reviews". Missing sections fall back to a stable
        // default order. Supersedes the legacy `reviewsFirst` flag.
        order: z.array(z.enum(["content", "faq", "reviews"])).optional(),
        reviewsFirst: z.boolean().optional(),
        showCta: z.boolean().optional(),
      })
      .optional(),
    // Optional overlay of trust signals on top of the side image.
    sideOverlay: z
      .object({
        title: z.string().optional(),
        subtitle: z.string().optional(),
        // Extra messaging shown under the name on desktop / under the headline
        // on mobile.
        message: z.string().optional(),
        bullets: z.array(z.string()).optional(),
      })
      .optional(),
    // Full-width top banner that slides down on load (announcements / trust +
    // a click-to-call button).
    banner: z
      .object({
        enabled: z.boolean().optional(),
        items: z.array(z.string()).optional(),
        phone: z.string().optional(),
        phoneLabel: z.string().optional(),
        // Explicit colors for the top bar; fall back to a tint of the theme.
        background: z.string().optional(),
        textColor: z.string().optional(),
        // Show the journey logo inside the bar (larger). When false the logo
        // stays in the in-form header instead.
        logoInBar: z.boolean().optional(),
      })
      .optional(),
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
  // Search & ads metadata for the landing page. When set, these override the
  // auto-generated values so Google Ads / search have strong, keyword-relevant
  // material instead of falling back to the brand + domain.
  seo: z
    .object({
      title: z.string().optional(), // the HTML <title> tag
      description: z.string().optional(), // meta description
      h1: z.string().optional(), // a crawlable main headline for the landing page
      // Spanish variants, used when the page is served in Spanish (e.g. a Spanish
      // ad pointing at ?lang=es). Each falls back to its English counterpart.
      titleEs: z.string().optional(),
      descriptionEs: z.string().optional(),
      h1Es: z.string().optional(),
    })
    .optional(),
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
