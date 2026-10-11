// Build and send the weekly last-7 vs prior-7 performance email. Numbers come
// from the same funnel / source / page math as Analytics.

import { prettyMedium, prettyPage, prettySource } from "@/components/admin/analyticsQuery";
import {
  computePeriodStats,
  deltaPct,
  deltaPts,
  lastSevenVsPriorSeven,
  pct,
  type DimRow,
  type PeriodStats,
  type WeekOverWeekWindows,
} from "@/modules/analytics/period";
import { retagReferralLeads } from "@/modules/leads/service";
import type { StoredOrg } from "@/server/store";
import { store } from "@/server/store";

const MIN_SESSIONS = 5;
const TOP_N = 6;

export interface WeeklyReport {
  orgName: string;
  windows: WeekOverWeekWindows;
  current: PeriodStats;
  prior: PeriodStats;
  insights: string[];
}

function signedPct(n: number | null): string {
  if (n === null) return "new";
  if (n === 0) return "flat";
  const rounded = Math.abs(n) >= 10 ? n.toFixed(0) : n.toFixed(1);
  return `${n > 0 ? "+" : ""}${rounded}%`;
}

function signedPts(n: number): string {
  if (Math.abs(n) < 0.05) return "flat";
  const rounded = Math.abs(n) >= 10 ? n.toFixed(0) : n.toFixed(1);
  return `${n > 0 ? "+" : ""}${rounded} pts`;
}

function arrow(curr: number, prev: number): "up" | "down" | "flat" {
  if (curr === prev) return "flat";
  return curr > prev ? "up" : "down";
}

function mergeDims(curr: DimRow[], prior: DimRow[]) {
  const keys = new Set([...curr.map((r) => r.key), ...prior.map((r) => r.key)]);
  const cmap = new Map(curr.map((r) => [r.key, r]));
  const pmap = new Map(prior.map((r) => [r.key, r]));
  return [...keys]
    .map((key) => {
      const c = cmap.get(key) ?? { key, sessions: 0, converted: 0 };
      const p = pmap.get(key) ?? { key, sessions: 0, converted: 0 };
      return {
        key,
        curr: c,
        prior: p,
        sessDelta: deltaPct(c.sessions, p.sessions),
        rateCurr: c.sessions ? c.converted / c.sessions : 0,
        ratePrior: p.sessions ? p.converted / p.sessions : 0,
      };
    })
    .sort((a, b) => b.curr.sessions - a.curr.sessions || a.key.localeCompare(b.key));
}

function insights(curr: PeriodStats, prior: PeriodStats, pretty: (k: string) => string, kind: "source" | "page"): string[] {
  const rows = mergeDims(kind === "source" ? curr.sources : curr.pages, kind === "source" ? prior.sources : prior.pages).filter(
    (r) => r.curr.sessions >= MIN_SESSIONS || r.prior.sessions >= MIN_SESSIONS,
  );
  if (!rows.length) return [];
  const byRateGain = [...rows].sort((a, b) => b.rateCurr - b.ratePrior - (a.rateCurr - a.ratePrior));
  const working = byRateGain[0];
  const slipping = byRateGain[byRateGain.length - 1];
  const out: string[] = [];
  if (working && working.rateCurr - working.ratePrior >= 0.02) {
    out.push(
      `Working: ${pretty(working.key)} — ${pct(working.curr.converted, working.curr.sessions)} conversion (was ${pct(working.prior.converted, working.prior.sessions)}) on ${working.curr.sessions} opens.`,
    );
  }
  if (slipping && slipping.key !== working?.key && slipping.ratePrior - slipping.rateCurr >= 0.02) {
    out.push(
      `Slipping: ${pretty(slipping.key)} — ${pct(slipping.curr.converted, slipping.curr.sessions)} conversion (was ${pct(slipping.prior.converted, slipping.prior.sessions)}) on ${slipping.curr.sessions} opens.`,
    );
  }
  return out;
}

export function buildWeeklyInsights(curr: PeriodStats, prior: PeriodStats): string[] {
  const lines: string[] = [];
  const traffic = deltaPct(curr.opened, prior.opened);
  const convPts = deltaPts(curr.conversionRate, prior.conversionRate);
  if (traffic === null) {
    lines.push(`Traffic: ${curr.opened} opens this week (no prior-week baseline).`);
  } else {
    lines.push(`Traffic is ${signedPct(traffic)} (${curr.opened} vs ${prior.opened} opens).`);
  }
  lines.push(
    `Conversion is ${signedPts(convPts)} (${pct(curr.converted, curr.opened)} vs ${pct(prior.converted, prior.opened)} of opens who called, submitted, or finished).`,
  );
  const actions = curr.journeyLeads + curr.formSubmits + curr.referrals;
  const priorActions = prior.journeyLeads + prior.formSubmits + prior.referrals;
  const actionDelta = deltaPct(actions, priorActions);
  lines.push(
    `Leads + referrals: ${actions} vs ${priorActions}${actionDelta === null ? "" : ` (${signedPct(actionDelta)})`} — ${curr.journeyLeads} journey, ${curr.formSubmits} callback forms, ${curr.referrals} referrals.`,
  );
  lines.push(...insights(curr, prior, prettySource, "source"));
  lines.push(...insights(curr, prior, prettyPage, "page"));
  return lines;
}

export async function buildWeeklyReport(org: StoredOrg): Promise<WeeklyReport> {
  const windows = lastSevenVsPriorSeven();
  const sinceISO = windows.prior.start.toISOString();
  const [events, leads] = await Promise.all([
    store.listEvents(org.id, sinceISO),
    retagReferralLeads(org.id, await store.listLeads(org.id)),
  ]);
  const current = computePeriodStats(events, leads, windows.current);
  const prior = computePeriodStats(events, leads, windows.prior);
  return {
    orgName: org.name,
    windows,
    current,
    prior,
    insights: buildWeeklyInsights(current, prior),
  };
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function deltaCell(curr: number, prev: number): string {
  const d = deltaPct(curr, prev);
  const tone = arrow(curr, prev);
  const color = tone === "up" ? "#15803d" : tone === "down" ? "#b45309" : "#6b7280";
  return `<span style="color:${color};font-weight:600">${esc(signedPct(d))}</span>`;
}

function rateDeltaCell(curr: number, prev: number, currN: number, prevN: number, currD: number, prevD: number): string {
  const pts = deltaPts(curr, prev);
  const tone = pts > 0.05 ? "up" : pts < -0.05 ? "down" : "flat";
  const color = tone === "up" ? "#15803d" : tone === "down" ? "#b45309" : "#6b7280";
  return `${esc(pct(currN, currD))} <span style="color:${color}">(${esc(signedPts(pts))})</span><br><span style="color:#9ca3af;font-size:12px">was ${esc(pct(prevN, prevD))}</span>`;
}

function kpiRow(label: string, curr: number, prev: number): string {
  return `<tr>
    <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#374151">${esc(label)}</td>
    <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;color:#111827">${curr}</td>
    <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#6b7280">${prev}</td>
    <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right">${deltaCell(curr, prev)}</td>
  </tr>`;
}

function dimTable(title: string, pretty: (k: string) => string, curr: DimRow[], prior: DimRow[]): string {
  const rows = mergeDims(curr, prior).slice(0, TOP_N);
  if (!rows.length) {
    return `<p style="margin:0;color:#9ca3af;font-size:14px">No ${esc(title.toLowerCase())} data this period.</p>`;
  }
  const body = rows
    .map((r) => {
      return `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#111827">${esc(pretty(r.key))}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">${r.curr.sessions}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#6b7280">${r.prior.sessions}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right">${deltaCell(r.curr.sessions, r.prior.sessions)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right">${rateDeltaCell(r.rateCurr, r.ratePrior, r.curr.converted, r.prior.converted, r.curr.sessions, r.prior.sessions)}</td>
      </tr>`;
    })
    .join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    <thead>
      <tr>
        <th align="left" style="padding:8px 12px;border-bottom:2px solid #e5e7eb;color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:0.04em">${esc(title)}</th>
        <th align="right" style="padding:8px 12px;border-bottom:2px solid #e5e7eb;color:#9ca3af;font-size:11px;text-transform:uppercase">This week</th>
        <th align="right" style="padding:8px 12px;border-bottom:2px solid #e5e7eb;color:#9ca3af;font-size:11px;text-transform:uppercase">Prior</th>
        <th align="right" style="padding:8px 12px;border-bottom:2px solid #e5e7eb;color:#9ca3af;font-size:11px;text-transform:uppercase">Traffic</th>
        <th align="right" style="padding:8px 12px;border-bottom:2px solid #e5e7eb;color:#9ca3af;font-size:11px;text-transform:uppercase">Conversion</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>`;
}

function analyticsUrl(): string {
  const root = (process.env.AUTH_URL || process.env.NEXTAUTH_URL || "").replace(/\/+$/, "");
  if (root) return `${root}/admin/analytics?range=7`;
  const host = (process.env.PLATFORM_ROOT_DOMAIN || "").replace(/\/+$/, "");
  if (host) return `https://${host}/admin/analytics?range=7`;
  return "/admin/analytics?range=7";
}

export function weeklyReportHtml(report: WeeklyReport): string {
  const { current: c, prior: p, windows, orgName, insights: lines } = report;
  const insightLis = lines.map((l) => `<li style="margin:0 0 8px;color:#374151;line-height:1.45">${esc(l)}</li>`).join("");
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <div style="max-width:680px;margin:0 auto;padding:24px 12px">
    <p style="margin:0 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.06em">Weekly performance</p>
    <h1 style="margin:0 0 4px;font-size:22px;color:#111827">${esc(orgName)}</h1>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px">
      <strong style="color:#111827">${esc(windows.current.label)}</strong>
      vs prior ${esc(windows.prior.label)}
      · Central time
    </p>

    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px 20px;margin-bottom:16px">
      <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#111827">What’s working vs not</p>
      <ul style="margin:0;padding-left:18px">${insightLis}</ul>
    </div>

    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:8px 4px;margin-bottom:16px">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <thead>
          <tr>
            <th align="left" style="padding:8px 12px;border-bottom:2px solid #e5e7eb;color:#9ca3af;font-size:11px;text-transform:uppercase">Metric</th>
            <th align="right" style="padding:8px 12px;border-bottom:2px solid #e5e7eb;color:#9ca3af;font-size:11px;text-transform:uppercase">This week</th>
            <th align="right" style="padding:8px 12px;border-bottom:2px solid #e5e7eb;color:#9ca3af;font-size:11px;text-transform:uppercase">Prior</th>
            <th align="right" style="padding:8px 12px;border-bottom:2px solid #e5e7eb;color:#9ca3af;font-size:11px;text-transform:uppercase">Change</th>
          </tr>
        </thead>
        <tbody>
          ${kpiRow("Opened (sessions)", c.opened, p.opened)}
          ${kpiRow("Took an action", c.converted, p.converted)}
          ${kpiRow("Started questions", c.started, p.started)}
          ${kpiRow("Call clicks", c.cta, p.cta)}
          ${kpiRow("Journey leads", c.journeyLeads, p.journeyLeads)}
          ${kpiRow("Callback forms", c.formSubmits, p.formSubmits)}
          ${kpiRow("Referrals", c.referrals, p.referrals)}
          ${kpiRow("Not a fit", c.declined, p.declined)}
          <tr>
            <td style="padding:10px 12px;color:#374151">Conversion rate</td>
            <td style="padding:10px 12px;text-align:right;font-weight:600;color:#111827">${esc(pct(c.converted, c.opened))}</td>
            <td style="padding:10px 12px;text-align:right;color:#6b7280">${esc(pct(p.converted, p.opened))}</td>
            <td style="padding:10px 12px;text-align:right"><span style="color:${deltaPts(c.conversionRate, p.conversionRate) >= 0 ? "#15803d" : "#b45309"};font-weight:600">${esc(signedPts(deltaPts(c.conversionRate, p.conversionRate)))}</span></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:12px 4px;margin-bottom:16px">
      ${dimTable("Source", prettySource, c.sources, p.sources)}
    </div>
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:12px 4px;margin-bottom:16px">
      ${dimTable("Medium", prettyMedium, c.mediums, p.mediums)}
    </div>
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:12px 4px;margin-bottom:16px">
      ${dimTable("Landing page", prettyPage, c.pages, p.pages)}
    </div>

    <p style="margin:8px 0 0;color:#9ca3af;font-size:12px;line-height:1.5">
      Conversion = unique people who called, submitted the callback form, or finished the questions.
      Same definitions as Analytics.
      <a href="${esc(analyticsUrl())}" style="color:#2563eb">Open the last 7 days in Analytics</a>
    </p>
  </div>
</body>
</html>`;
}

export function weeklyReportText(report: WeeklyReport): string {
  const { current: c, prior: p, windows, orgName, insights: lines } = report;
  const kpi = (label: string, curr: number, prev: number) =>
    `${label}: ${curr} vs ${prev} (${signedPct(deltaPct(curr, prev))})`;
  const dimLines = (title: string, pretty: (k: string) => string, curr: DimRow[], prior: DimRow[]) => {
    const rows = mergeDims(curr, prior).slice(0, TOP_N);
    if (!rows.length) return `${title}: none`;
    return [
      title,
      ...rows.map(
        (r) =>
          `  ${pretty(r.key)} — ${r.curr.sessions} opens (${signedPct(r.sessDelta)}) · ${pct(r.curr.converted, r.curr.sessions)} conv (was ${pct(r.prior.converted, r.prior.sessions)})`,
      ),
    ].join("\n");
  };
  return [
    `Weekly performance — ${orgName}`,
    `${windows.current.label} vs prior ${windows.prior.label} (Central)`,
    "",
    "What's working vs not",
    ...lines.map((l) => `• ${l}`),
    "",
    kpi("Opened", c.opened, p.opened),
    kpi("Took an action", c.converted, p.converted),
    `Conversion: ${pct(c.converted, c.opened)} vs ${pct(p.converted, p.opened)} (${signedPts(deltaPts(c.conversionRate, p.conversionRate))})`,
    kpi("Call clicks", c.cta, p.cta),
    kpi("Journey leads", c.journeyLeads, p.journeyLeads),
    kpi("Callback forms", c.formSubmits, p.formSubmits),
    kpi("Referrals", c.referrals, p.referrals),
    "",
    dimLines("Sources", prettySource, c.sources, p.sources),
    "",
    dimLines("Mediums", prettyMedium, c.mediums, p.mediums),
    "",
    dimLines("Pages", prettyPage, c.pages, p.pages),
    "",
    analyticsUrl(),
  ].join("\n");
}

export function weeklyReportSubject(report: WeeklyReport): string {
  const conv = pct(report.current.converted, report.current.opened);
  const pts = signedPts(deltaPts(report.current.conversionRate, report.prior.conversionRate));
  return `${report.orgName}: weekly intake — ${conv} conversion (${pts})`;
}

export async function sendWeeklyReportEmail(to: string[], report: WeeklyReport): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.AUTOMATION_EMAIL_FROM?.trim();
  if (!key || !from) {
    throw new Error("Email isn’t configured. Set RESEND_API_KEY and AUTOMATION_EMAIL_FROM.");
  }
  const recipients = to.map((s) => s.trim()).filter(Boolean);
  if (!recipients.length) throw new Error("Add at least one recipient.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from,
      to: recipients,
      subject: weeklyReportSubject(report),
      html: weeklyReportHtml(report),
      text: weeklyReportText(report),
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text().catch(() => "")}`);
}
