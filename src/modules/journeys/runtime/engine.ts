// =============================================================================
// Journey Runtime Engine
// -----------------------------------------------------------------------------
// Pure, isomorphic logic that drives a journey: which pages are visible, what
// comes next given current answers, and how a completed answer set scores &
// qualifies. Shared by the client player (UX) and the server (authoritative
// scoring at submission). No React, no DB — just data in, data out.
// =============================================================================

import { evaluate, evaluateBoolean, type EvalContext } from "../domain/expression";
import type { Component, JourneyDefinition, Page, PageType } from "../domain/schema";

export type Answers = Record<string, unknown>;

/** Terminal/ending screens: the flow stops here and the lead is submitted. */
export function isTerminalType(type: PageType): boolean {
  return type === "success" || type === "referral" || type === "decline" || type === "end";
}

/**
 * Resolve the next page id from the current page. Precedence:
 *   1. an option's explicit `goTo` (flow-builder branching)
 *   2. the page's conditional `next` rules
 *   3. the next visible page in document order
 * Returns null when there is nothing after this page.
 */
export function resolveNext(
  def: JourneyDefinition,
  currentPageId: string,
  answers: Answers,
  optionGoTo?: string,
): string | null {
  if (optionGoTo) return optionGoTo;
  const ctx = buildContext(def, answers);
  const current = def.pages.find((p) => p.id === currentPageId);
  if (current?.next) {
    for (const rule of current.next) {
      if (evaluateBoolean(rule.when, ctx)) return rule.goTo;
    }
  }
  // Unconditional Continue destination (e.g. an open-ended page with no option
  // branching). Only used when no conditional rule matched above.
  if (current?.advanceTo && def.pages.some((p) => p.id === current.advanceTo)) {
    return current.advanceTo;
  }
  return nextVisibleInOrder(def, currentPageId, answers);
}

/**
 * The next visible page after `currentPageId` in document order.
 *
 * Normally this is the following entry in the visible-pages list. But a page can
 * hide *itself* once answered — e.g. a contact page shown only `{ empty: full_name }`
 * disappears from the visible set the moment its own name field is filled. When
 * that happens the current page is no longer in the visible list, so we fall back
 * to the full page order and return the first still-visible page after it (rather
 * than restarting at the first page, which would bounce the visitor to the start).
 */
function nextVisibleInOrder(def: JourneyDefinition, currentPageId: string, answers: Answers): string | null {
  const visible = visiblePages(def, answers);
  const idx = visible.findIndex((p) => p.id === currentPageId);
  if (idx !== -1) return visible[idx + 1]?.id ?? null;
  const allIdx = def.pages.findIndex((p) => p.id === currentPageId);
  for (let i = allIdx + 1; i < def.pages.length; i++) {
    if (isPageVisible(def.pages[i]!, def, answers)) return def.pages[i]!.id;
  }
  return null;
}

/** Build the evaluation context: variable defaults overlaid with answers. */
export function buildContext(def: JourneyDefinition, answers: Answers): EvalContext {
  const ctx: EvalContext = {};
  for (const v of def.variables) {
    if (v.default !== undefined) ctx[v.key] = v.default;
  }
  return { ...ctx, ...answers };
}

/** Is a page visible given the current answers? */
export function isPageVisible(page: Page, def: JourneyDefinition, answers: Answers): boolean {
  return evaluateBoolean(page.condition, buildContext(def, answers));
}

/** Is a component visible given the current answers? */
export function isComponentVisible(component: Component, def: JourneyDefinition, answers: Answers): boolean {
  return evaluateBoolean(component.condition, buildContext(def, answers));
}

/** All pages currently visible, in order. */
export function visiblePages(def: JourneyDefinition, answers: Answers): Page[] {
  return def.pages.filter((p) => isPageVisible(p, def, answers));
}

/**
 * Given the current page and answers, resolve the next page id. Honors explicit
 * `next` branching rules (first truthy wins); otherwise advances to the next
 * visible page in document order. Returns null when the journey is complete.
 */
export function nextPageId(currentPageId: string, def: JourneyDefinition, answers: Answers): string | null {
  const ctx = buildContext(def, answers);
  const current = def.pages.find((p) => p.id === currentPageId);
  if (current?.next) {
    for (const rule of current.next) {
      if (evaluateBoolean(rule.when, ctx)) {
        // Only jump if the target is currently visible; else fall through.
        const target = def.pages.find((p) => p.id === rule.goTo);
        if (target && isPageVisible(target, def, answers)) return rule.goTo;
      }
    }
  }
  // Unconditional Continue destination, when set and currently visible.
  if (current?.advanceTo) {
    const target = def.pages.find((p) => p.id === current.advanceTo);
    if (target && isPageVisible(target, def, answers)) return current.advanceTo;
  }
  return nextVisibleInOrder(def, currentPageId, answers);
}

export interface ScoreResult {
  score: number;
  qualified: boolean;
  breakdown: Array<{ label: string; points: number }>;
}

/**
 * Authoritative scoring & qualification. Sums option-level scores and journey
 * scoring rules, then applies the qualification policy (rule and/or minScore).
 */
export function scoreLead(def: JourneyDefinition, answers: Answers): ScoreResult {
  const ctx = buildContext(def, answers);
  const breakdown: Array<{ label: string; points: number }> = [];
  let score = 0;

  // Option-level scores (score attached to a chosen option).
  for (const page of def.pages) {
    for (const c of page.components) {
      if (!c.key || !c.options) continue;
      const answer = answers[c.key];
      const selected = Array.isArray(answer) ? answer : [answer];
      for (const opt of c.options) {
        if (opt.score && selected.some((s) => String(s) === opt.value)) {
          score += opt.score;
          breakdown.push({ label: `${c.label ?? c.key}: ${opt.label}`, points: opt.score });
        }
      }
    }
  }

  // Journey-level scoring rules.
  for (const rule of def.scoring) {
    if (evaluateBoolean(rule.when, ctx)) {
      score += rule.points;
      breakdown.push({ label: rule.label ?? "rule", points: rule.points });
    }
  }

  // Qualification policy.
  let qualified = true;
  const q = def.qualification;
  if (q) {
    if (q.rule !== undefined) qualified = qualified && Boolean(evaluate(q.rule, ctx));
    if (typeof q.minScore === "number") qualified = qualified && score >= q.minScore;
  }

  return { score, qualified, breakdown };
}

/** Extract denormalized contact fields from answers using conventional keys. */
export function extractContact(def: JourneyDefinition, answers: Answers) {
  const byType = (t: string) => {
    for (const page of def.pages) {
      for (const c of page.components) {
        if (c.type === t && c.key && answers[c.key]) return String(answers[c.key]);
      }
    }
    return undefined;
  };
  const nameKey = ["full_name", "name", "first_name"].find((k) => answers[k]);
  return {
    displayName: nameKey ? String(answers[nameKey]) : undefined,
    email: byType("email"),
    phone: byType("phone"),
  };
}
