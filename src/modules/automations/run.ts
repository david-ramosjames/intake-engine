// Automation execution. When a lead completes, we load the org's enabled
// automations and run their actions (email, Slack). Everything here is
// best-effort: a failing action is logged and never blocks the lead response.
//
// Config (env):
//   RESEND_API_KEY         — enables the email action (https://resend.com)
//   AUTOMATION_EMAIL_FROM  — the From address for emails (e.g. "Firm <leads@firm.com>")
// Slack needs no env: each Slack action carries its own incoming-webhook URL.

import { answerRows } from "@/modules/leads/answers";
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
    // Internal: lead is heading to (or on) a Sign step — SMS apps should wait
    // for a "Contract sent" thread reply before following up.
    _contractPath: lead.context?.contractPath === "1" ? "1" : "",
    // Internal: the full, human-readable lead detail block for Slack.
    _detail: buildLeadDetail(journey, lead),
  };
  // Every answer becomes a token too (e.g. {{description}}, {{case_type}}).
  for (const [k, v] of Object.entries(lead.answers ?? {})) {
    if (ctx[k] === undefined) ctx[k] = Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v);
  }
  return ctx;
}

/** A complete, readable summary of the lead for Slack: contact, source, and
 *  every question/answer with its label. So the intake team has it all in one
 *  message without opening the dashboard. */
function buildLeadDetail(journey: StoredJourney, lead: StoredLead): string {
  const lines: string[] = [];
  const contact = [lead.phone && `📞 ${lead.phone}`, lead.email && `✉️ ${lead.email}`].filter(Boolean).join("   ·   ");
  if (contact) lines.push(contact);
  const src = [lead.source, lead.medium].filter(Boolean).join(" / ");
  if (src) lines.push(`Source: ${src}${lead.campaign ? ` · campaign ${lead.campaign}` : ""}`);
  const rows = answerRows(journey.definition, lead.answers ?? {});
  if (rows.length) {
    lines.push("");
    lines.push("*Details*");
    for (const r of rows) lines.push(`• *${r.label}:* ${r.value}`);
  }
  return lines.join("\n");
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

type SlackPostResult = { ts?: string; channel?: string };

async function postSlackMessage(
  action: SlackAction,
  text: string,
  thread?: { ts: string; channel?: string },
): Promise<SlackPostResult> {
  const token = action.botToken?.trim();
  const channel = (thread?.channel || action.channel || "").trim();
  if (token && (channel || thread?.ts)) {
    const body: Record<string, unknown> = { text, unfurl_links: false, unfurl_media: false };
    if (channel) body.channel = channel;
    if (thread?.ts) {
      body.thread_ts = thread.ts;
      body.reply_broadcast = false;
    }
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { ok?: boolean; ts?: string; channel?: string; error?: string };
    if (json.ok) return { ts: json.ts, channel: json.channel };
    // Fall through to the webhook so a missing channel invite doesn't drop the lead.
    console.error("[automation] Slack API post failed", json.error ?? res.status);
  }
  const url = action.webhookUrl?.trim();
  if (!url) return {};
  const payload: Record<string, unknown> = { text };
  if (thread?.ts) payload.thread_ts = thread.ts;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Slack webhook ${res.status}`);
  return {};
}

async function runSlack(action: SlackAction, ctx: Ctx): Promise<SlackPostResult> {
  if (!action.webhookUrl?.trim() && !action.botToken?.trim()) return {};
  // Ping Slack for actionable outcomes (lead / referral). Skip a "not a fit"
  // (declined) ONLY when the visitor didn't type a message — if they wrote
  // something (e.g. an inquiry), notify so the team can decide whether to reply.
  if (ctx.outcome === "declined" && ctx._hasMessage !== "1") return {};
  // Type label so the channel can tell at a glance what kind of submission it is.
  const label =
    ctx.outcome === "referral"
      ? "🔵 *Referral*"
      : ctx.outcome === "declined"
        ? "🟠 *Not a fit — visitor left a message*"
        : "🟢 *New lead*";
  const header = `${label}${ctx.journey ? ` · ${ctx.journey}` : ""}`;
  const name = ctx.name?.trim();
  const note = renderTemplate(action.message, ctx).trim();
  // Marker for SMS follow-up apps: wait for a threaded "Contract sent" before
  // texting; if it never arrives, treat as abandoned and send SMS.
  const contractPath = ctx._contractPath === "1" ? "📝 *Contract path*" : "";
  const text = [header, "_From Intake Engine landing page_", contractPath, name ? `*${name}*` : "", note, ctx._detail]
    .filter((s) => s && s.trim())
    .join("\n");
  return postSlackMessage(action, text);
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

async function runAction(action: AutomationAction, ctx: Ctx): Promise<SlackPostResult | void> {
  if (action.type === "slack") return runSlack(action, ctx);
  if (action.type === "email") return runEmail(action, ctx);
}

/**
 * Run every enabled automation that matches this completed lead. Org-wide
 * automations (no journeyId) and ones scoped to this journey both fire.
 * Best-effort: individual action failures are caught and logged.
 */
export async function runLeadAutomations(
  journey: StoredJourney,
  lead: StoredLead,
): Promise<{ slackTs?: string; slackChannel?: string }> {
  let automations: StoredAutomation[];
  try {
    automations = await store.listAutomations(journey.orgId);
  } catch (e) {
    console.error("[automation] failed to load automations", e);
    return {};
  }
  const matched = automations.filter(
    (a) =>
      a.enabled &&
      (a.trigger?.event ?? "LEAD_COMPLETED") === "LEAD_COMPLETED" &&
      (!a.journeyId || a.journeyId === journey.id),
  );
  if (matched.length === 0) return {};
  const ctx = leadContext(journey, lead);
  let slackMeta: { slackTs?: string; slackChannel?: string } = {};
  for (const auto of matched) {
    for (const action of auto.actions ?? []) {
      try {
        const posted = await runAction(action, ctx);
        if (posted && posted.ts) {
          slackMeta = { slackTs: posted.ts, slackChannel: posted.channel };
        }
      } catch (e) {
        console.error(`[automation] "${auto.name}" ${action.type} action failed:`, e);
      }
    }
  }
  return slackMeta;
}

/** Thread or post a follow-up Slack note for an existing lead. */
async function postSlackLeadFollowUp(
  journey: StoredJourney,
  lead: StoredLead,
  threadedBody: string,
  standaloneBody: string,
): Promise<void> {
  let automations: StoredAutomation[];
  try {
    automations = await store.listAutomations(journey.orgId);
  } catch (e) {
    console.error("[automation] failed to load automations", e);
    return;
  }
  const matched = automations.filter(
    (a) => a.enabled && (!a.journeyId || a.journeyId === journey.id),
  );
  const threadTs = lead.context?.slackTs;
  const threadChannel = lead.context?.slackChannel;
  const body = threadTs ? threadedBody : standaloneBody;
  for (const auto of matched) {
    for (const action of auto.actions ?? []) {
      if (action.type !== "slack") continue;
      try {
        await postSlackMessage(
          action,
          body,
          threadTs ? { ts: threadTs, channel: threadChannel || action.channel } : undefined,
        );
      } catch (e) {
        console.error(`[automation] "${auto.name}" Slack follow-up failed:`, e);
      }
    }
  }
}

/** Thread extra details onto the original Slack lead post when we have a ts. */
export async function postSlackMoreDetail(journey: StoredJourney, lead: StoredLead, extra: string): Promise<void> {
  const text = extra.trim();
  if (!text) return;
  const name = lead.displayName?.trim();
  await postSlackLeadFollowUp(
    journey,
    lead,
    ["*More details they added:*", "", text].join("\n"),
    ["↪️ *More details they added*", name ? `*${name}*` : "", "_From Intake Engine landing page_", "", text]
      .filter((s) => s && s.trim())
      .join("\n"),
  );
}

/** Note on the lead's Slack post that a contract was created for them to sign. */
export async function postSlackContractSent(journey: StoredJourney, lead: StoredLead): Promise<void> {
  const name = lead.displayName?.trim();
  await postSlackLeadFollowUp(
    journey,
    lead,
    "📝 *Contract sent to be signed*",
    ["📝 *Contract sent to be signed*", name ? `*${name}*` : "", "_From Intake Engine landing page_"]
      .filter((s) => s && s.trim())
      .join("\n"),
  );
}
