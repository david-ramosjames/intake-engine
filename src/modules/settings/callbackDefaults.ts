// Business-level default text for the "quick callback" contact card, in English
// and Spanish. Set once in Settings and applied to every journey's callback card
// at render time, so the wording is identical everywhere instead of edited in
// each journey. Stored in the org settings blob under `callback`.

import { tk } from "@/modules/journeys/domain/i18n";
import type { JourneyDefinition } from "@/modules/journeys/domain/schema";

// The default field IDs used by the built-in callback card (see JourneyPlayer's
// defaultCallbackFields). Field labels are localized under these ids.
export const CALLBACK_FIELD_IDS = {
  name: "cb-name",
  phone: "cb-phone",
  email: "cb-email",
  message: "cb-msg",
} as const;

// The wording shown when nothing is configured. Also used to pre-fill the
// Settings form and as the runtime fallback so Spanish visitors always see
// Spanish copy even before an org customizes it.
export const CALLBACK_TEXT_DEFAULTS = {
  heading: "Prefer a quick callback? Leave your information.",
  headingEs: "¿Prefiere una llamada rápida? Déjenos su información.",
  buttonLabel: "Request callback",
  buttonLabelEs: "Solicitar llamada",
  buttonSubtitle: "We'll reach out shortly",
  buttonSubtitleEs: "Nos comunicaremos en breve",
  secureText: "Your information is secure and will never be shared.",
  secureTextEs: "Su información es segura y nunca será compartida.",
  nameLabel: "Your name",
  nameLabelEs: "Tu nombre",
  phoneLabel: "Phone number",
  phoneLabelEs: "Número de teléfono",
  emailLabel: "Email address (optional)",
  emailLabelEs: "Correo electrónico (opcional)",
  messageLabel: "How can we help?",
  messageLabelEs: "¿Cómo podemos ayudarte?",
} as const;

export type CallbackDefaults = { -readonly [K in keyof typeof CALLBACK_TEXT_DEFAULTS]: string };

/** The org's saved callback text (blank fields = "use the built-in default"). */
export function readCallbackDefaults(settings: Record<string, unknown> | undefined): CallbackDefaults {
  const s = settings?.callback;
  const o = s && typeof s === "object" ? (s as Record<string, unknown>) : {};
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const out = {} as CallbackDefaults;
  for (const k of Object.keys(CALLBACK_TEXT_DEFAULTS) as Array<keyof CallbackDefaults>) out[k] = str(o[k]);
  return out;
}

// Theme-level text keys (heading / button / secure), resolved by the localizer.
const themeKeyMap = {
  heading: tk.callbackHeading(),
  buttonLabel: tk.callbackButton(),
  buttonSubtitle: tk.callbackButtonSub(),
  secureText: tk.callbackSecure(),
} as const;

// Field-label keys (name / phone / email / message), resolved by the localizer.
const fieldKeyMap = {
  nameLabel: tk.label(CALLBACK_FIELD_IDS.name),
  phoneLabel: tk.label(CALLBACK_FIELD_IDS.phone),
  emailLabel: tk.label(CALLBACK_FIELD_IDS.email),
  messageLabel: tk.label(CALLBACK_FIELD_IDS.message),
} as const;

/**
 * Return a copy of the definition with the org's callback text applied. Each
 * field is an English + Spanish pair; when the org has set *either* language for
 * a field, we write *both* — the set value and the built-in default for the
 * other language — so a Spanish visitor never sees English from a blank Spanish
 * box (and vice-versa). Fields the org didn't touch are left for the card's own
 * locale-aware fallback. English theme text goes onto `theme.callback`; Spanish
 * theme text and both languages of the field labels go into `i18n`. Master text
 * wins over any per-journey wording. Done immutably.
 */
export function applyCallbackDefaults(def: JourneyDefinition, d: CallbackDefaults): JourneyDefinition {
  const touched = (Object.keys(CALLBACK_TEXT_DEFAULTS) as Array<keyof CallbackDefaults>).some((k) => d[k]);
  if (!touched) return def;

  const theme = { ...(def.theme ?? {}) };
  const callback = { ...(theme.callback ?? {}) };
  const en = { ...(def.i18n?.en ?? {}) };
  const es = { ...(def.i18n?.es ?? {}) };

  const val = (k: keyof CallbackDefaults) => d[k] || CALLBACK_TEXT_DEFAULTS[k];

  // Theme text: English on the theme object, Spanish via i18n.
  for (const [field, key] of Object.entries(themeKeyMap) as Array<[keyof typeof themeKeyMap, string]>) {
    const esField = `${field}Es` as keyof CallbackDefaults;
    if (!d[field] && !d[esField]) continue;
    callback[field] = val(field);
    es[key] = val(esField);
  }
  theme.callback = callback;

  // Field labels: both languages via i18n (labels aren't on the theme object).
  for (const [field, key] of Object.entries(fieldKeyMap) as Array<[keyof typeof fieldKeyMap, string]>) {
    const esField = `${field}Es` as keyof CallbackDefaults;
    if (!d[field] && !d[esField]) continue;
    en[key] = val(field);
    es[key] = val(esField);
  }

  return { ...def, theme, i18n: { ...(def.i18n ?? {}), en, es } };
}
