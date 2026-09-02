// Collects every translatable string in a journey definition, each paired with
// the stable i18n key the runtime/editor use. Pure and isomorphic (no server or
// React deps) so both the editor (to gather what to translate) and any server
// tooling can call it. Mirrors exactly the L(tk.*, source) lookups in the runtime.

import { tk } from "./i18n";
import type { JourneyDefinition } from "./schema";

export interface TranslatableString {
  key: string;
  text: string;
}

export function collectStrings(def: JourneyDefinition): TranslatableString[] {
  const out: TranslatableString[] = [];
  const push = (key: string, text: unknown) => {
    if (typeof text === "string" && text.trim() !== "") out.push({ key, text });
  };

  for (const page of def.pages ?? []) {
    push(tk.continue(page.id), page.continueLabel);
    push(tk.continueSubtitle(page.id), page.continueSubtitle);
    (page.cta ?? []).forEach((c, i) => {
      push(tk.cta(page.id, i), c.label);
      push(tk.ctaSubtitle(page.id, i), c.subtitle);
      push(tk.ctaNote(page.id, i), c.note);
    });
    for (const comp of page.components ?? []) {
      push(tk.content(comp.id), comp.content);
      push(tk.label(comp.id), comp.label);
      push(tk.help(comp.id), comp.helpText);
      for (const opt of comp.options ?? []) push(tk.option(comp.id, opt.value), opt.label);
      (comp.stats ?? []).forEach((s, i) => push(tk.statLabel(comp.id, i), s.label));
    }
  }

  const t = def.theme ?? {};
  (t.banner?.items ?? []).forEach((it, i) => push(tk.bannerItem(i), it));
  push(tk.callbackHeading(), t.callback?.heading);
  push(tk.callbackButton(), t.callback?.buttonLabel);
  push(tk.callbackButtonSub(), t.callback?.buttonSubtitle);
  push(tk.callbackSecure(), t.callback?.secureText);
  push(tk.overlayTitle(), t.sideOverlay?.title);
  push(tk.overlaySubtitle(), t.sideOverlay?.subtitle);
  push(tk.overlayMessage(), t.sideOverlay?.message);
  (t.sideOverlay?.bullets ?? []).forEach((b, i) => push(tk.overlayBullet(i), b));
  push(tk.faqHeading(), t.faq?.heading);
  (t.faq?.items ?? []).forEach((it, i) => {
    push(tk.faqQuestion(i), it.q);
    push(tk.faqAnswer(i), it.a);
  });
  push(tk.faqDisclaimer(), t.faq?.disclaimer);
  push(tk.reviewsHeading(), t.reviews?.heading);
  (t.reviews?.items ?? []).forEach((it, i) => push(tk.reviewText(i), it.text));

  return out;
}
