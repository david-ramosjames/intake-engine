// Automation execution. When a lead completes, we load the org's enabled
// automations and run their actions (email, Slack). Everything here is
// best-effort: a failing action is logged and never blocks the lead response.
//
// Config (env):
//   RESEND_API_KEY         — enables the email action (https://resend.com)
//   AUTOMATION_EMAIL_FROM  — the From address for emails (e.g. "Firm <leads@firm.com>")
// Slack needs no env: each Slack action carries its own incoming-webhook URL.

import { store, type StoredAutomation, type StoredJourney, type StoredLead } from "@/server/store";
import type { AutomationAction, EmailAction, SlackAction } from "@/server/store/types";

type Ctx = Record<string, string>;

// Free-text answer types and message-like keys. Used to decide whether a lead
// "typed something" (a written message worth reading) vs. only picking options.
const MESSAGE_TYPES = new Set(["longText", "textarea"]);
const MESSAGE_KEY = /message|description|details|comment|notes|question|tell/i;

/** True when the visitor entered a free-text message (not just picked options). */
function leadHasMessage(journey: StoredJourney, lead: StoredLead): boolean {
  for (const page of journey.definition.pages) {
    for (const c of page.components) {
      if (!c.key) continue;
      const v = lead.answers?.[c.key];
      if (typeof v !== "string" || !v.trim()) continue;
      if (MESSAGE_TYPES.has(c.type as string) || MESSAGE_KEY.test(c.key)) return true;
    }
  }
  return false;
}

/** Flatten a lead into {{token}} values usable in action text. */
function leadContext(journey: StoredJourney, lead: StoredLead): Ctx {
  const ctx: Ctx = {
    name: lead.displayName ?? "",
    email: lead.email ?? "",
    phone: lead.phone ?? "",
    outcome: lead.outcome,
    score: String(lead.score),
    journey: journey.name,
    source: lead.source ?? "",
    campaign: lead.campaign ?? "",
    // Internal flag (not a real answer token) used to gate Slack on declines.
    _hasMessage: leadHasMessage(journey, lead) ? "1" : "",
  };
  // Every answer becomes a token too (e.g. {{description}}, {{case_type}}).
  for (const [k, v] of Object.entries(lead.answers ?? {})) {
    if (ctx[k] === undefined) ctx[k] = Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v);
  }
  return ctx;
}

/** Replace {{ token }} occurrences; unknown tokens collapse to empty strings. */
export function renderTemplate(tpl: string, ctx: Ctx): string {
  return (tpl ?? "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key) => ctx[key] ?? "");
}

/** A readable fallback body when an action's text is left blank. */
function summary(ctx: Ctx): string {
  const lines = [
    `New lead${ctx.journey ? ` — ${ctx.journey}` : ""}`,
    ctx.name && `Name: ${ctx.name}`,
    ctx.phone && `Phone: ${ctx.phone}`,
    ctx.email && `Email: ${ctx.email}`,
    ctx.description && `Message: ${ctx.description}`,
  ].filter(Boolean);
  return lines.join("\n");
}

async function runSlack(action: SlackAction, ctx: Ctx): Promise<void> {
  const url = action.webhookUrl?.trim();
  if (!url) return;
  // Ping Slack for actionable outcomes (lead / referral). Skip a "not a fit"
  // (declined) ONLY when the visitor didn't type a message — if they wrote
  // something (e.g. an inquiry), notify so the team can decide whether to reply.
  if (ctx.outcome === "declined" && ctx._hasMessage !== "1") return;
  let text = renderTemplate(action.message, ctx).trim() || summary(ctx);
  // Always include the visitor's message, even when the configured template
  // doesn't reference {{description}} (append only if not already present).
  const msg = ctx.description?.trim();
  if (msg && !text.includes(msg)) text += `\n💬 Message: ${msg}`;
  // Lead the message with a clear type label so the channel can tell at a glance
  // what kind of submission it is.
  const label =
    ctx.outcome === "referral"
      ? "🔵 *Referral*"
      : ctx.outcome === "declined"
        ? "🟠 *Not a fit — visitor left a message*"
        : "🟢 *New lead*";
  text = `${label}\n${text}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Slack webhook ${res.status}`);
}

async function runEmail(action: EmailAction, ctx: Ctx): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.AUTOMATION_EMAIL_FROM;
  if (!key || !from) {
    console.warn("[automation] email skipped — set RESEND_API_KEY and AUTOMATION_EMAIL_FROM to enable email.");
    return;
  }
  const to = renderTemplate(action.to, ctx).trim();
  if (!to) return;
  const subject = renderTemplate(action.subject, ctx).trim() || `New lead${ctx.journey ? ` — ${ctx.journey}` : ""}`;
  const bodyText = renderTemplate(action.body, ctx).trim() || summary(ctx);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from,
      to: to.split(",").map((s) => s.trim()).filter(Boolean),
      subject,
      html: bodyText.replace(/\n/g, "<br>"),
      text: bodyText,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text().catch(() => "")}`);
}

async function runAction(action: AutomationAction, ctx: Ctx): Promise<void> {
  if (action.type === "slack") return runSlack(action, ctx);
  if (action.type === "email") return runEmail(action, ctx);
}

/**
 * Run every enabled automation that matches this completed lead. Org-wide
 * automations (no journeyId) and ones scoped to this journey both fire.
 * Best-effort: individual action failures are caught and logged.
 */
export async function runLeadAutomations(journey: StoredJourney, lead: StoredLead): Promise<void> {
  let automations: StoredAutomation[];
  try {
    automations = await store.listAutomations(journey.orgId);
  } catch (e) {
    console.error("[automation] failed to load automations", e);
    return;
  }
  const matched = automations.filter(
    (a) =>
      a.enabled &&
      (a.trigger?.event ?? "LEAD_COMPLETED") === "LEAD_COMPLETED" &&
      (!a.journeyId || a.journeyId === journey.id),
  );
  if (matched.length === 0) return;
  const ctx = leadContext(journey, lead);
  for (const auto of matched) {
    for (const action of auto.actions ?? []) {
      try {
        await runAction(action, ctx);
      } catch (e) {
        console.error(`[automation] "${auto.name}" ${action.type} action failed:`, e);
      }
    }
  }
}
