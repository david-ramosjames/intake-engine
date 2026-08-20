// Business-level default text for the "quick callback" contact card, in English
// and Spanish. Set once in Settings and applied to every journey's callback card
// at render time, so the wording is identical everywhere instead of edited in
// each journey. Stored in the org settings blob under `callback`.

import { tk } from "@/modules/journeys/domain/i18n";
import type { JourneyDefinition } from "@/modules/journeys/domain/schema";

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
} as const;

export interface CallbackDefaults {
  heading: string;
  headingEs: string;
  buttonLabel: string;
  buttonLabelEs: string;
  buttonSubtitle: string;
  buttonSubtitleEs: string;
  secureText: string;
  secureTextEs: string;
}

/** The org's saved callback text (blank fields = "use the built-in default"). */
export function readCallbackDefaults(settings: Record<string, unknown> | undefined): CallbackDefaults {
  const s = settings?.callback;
  const o = s && typeof s === "object" ? (s as Record<string, unknown>) : {};
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return {
    heading: str(o.heading),
    headingEs: str(o.headingEs),
    buttonLabel: str(o.buttonLabel),
    buttonLabelEs: str(o.buttonLabelEs),
    buttonSubtitle: str(o.buttonSubtitle),
    buttonSubtitleEs: str(o.buttonSubtitleEs),
    secureText: str(o.secureText),
    secureTextEs: str(o.secureTextEs),
  };
}

/**
 * Return a copy of the definition with the org's callback text applied to the
 * card: English onto `theme.callback.*` and Spanish injected as `i18n.es`
 * overrides for the callback keys (so the existing localizer resolves both).
 * Master text wins over any per-journey wording — this is the single source.
 * Only set fields override; blanks leave the built-in default in place. Done
 * immutably (never mutate the cached definition).
 */
export function applyCallbackDefaults(def: JourneyDefinition, d: CallbackDefaults): JourneyDefinition {
  // Each field is an English + Spanish pair. When the org has set *either*
  // language for a field, we write *both* — the set value, and the built-in
  // default for the other language — so a Spanish visitor never sees English
  // just because the Spanish box was left blank (and vice-versa). Fields the
  // org didn't touch at all are left for the card's own locale-aware fallback.
  const pairs: Array<[keyof typeof callbackKeyMap, string, string, string, string]> = [
    ["heading", d.heading, d.headingEs, CALLBACK_TEXT_DEFAULTS.heading, CALLBACK_TEXT_DEFAULTS.headingEs],
    ["buttonLabel", d.buttonLabel, d.buttonLabelEs, CALLBACK_TEXT_DEFAULTS.buttonLabel, CALLBACK_TEXT_DEFAULTS.buttonLabelEs],
    ["buttonSubtitle", d.buttonSubtitle, d.buttonSubtitleEs, CALLBACK_TEXT_DEFAULTS.buttonSubtitle, CALLBACK_TEXT_DEFAULTS.buttonSubtitleEs],
    ["secureText", d.secureText, d.secureTextEs, CALLBACK_TEXT_DEFAULTS.secureText, CALLBACK_TEXT_DEFAULTS.secureTextEs],
  ];
  if (!pairs.some(([, en, es]) => en || es)) return def;

  const theme = { ...(def.theme ?? {}) };
  const callback = { ...(theme.callback ?? {}) };
  const es = { ...(def.i18n?.es ?? {}) };
  for (const [field, en, esVal, defEn, defEs] of pairs) {
    if (!en && !esVal) continue; // untouched — leave the card's built-in fallback
    callback[field] = en || defEn;
    es[callbackKeyMap[field]] = esVal || defEs;
  }
  theme.callback = callback;

  return { ...def, theme, i18n: { ...(def.i18n ?? {}), es } };
}

// Maps each callback text field to its localization key (see i18n.ts).
const callbackKeyMap = {
  heading: tk.callbackHeading(),
  buttonLabel: tk.callbackButton(),
  buttonSubtitle: tk.callbackButtonSub(),
  secureText: tk.callbackSecure(),
} as const;
