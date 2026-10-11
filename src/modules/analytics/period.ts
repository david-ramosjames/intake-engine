// Rolling 7-day vs prior 7-day windows in America/Chicago, plus the same
// funnel / source / page math the Analytics page uses — so the weekly email
// matches what you see in admin.

import { landingPageKey } from "@/components/admin/analyticsQuery";
import { isCallbackFormLead } from "@/modules/leads/answers";
import type { StoredEvent, StoredLead } from "@/server/store";

const TZ = "America/Chicago";

export interface DimRow {
  key: string;
  sessions: number;
  converted: number;
}

export interface PeriodStats {
  opened: number;
  started: number;
  converted: number;
  conversionRate: number;
  cta: number;
  journeyLeads: number;
  formSubmits: number;
  referrals: number;
  declined: number;
  sources: DimRow[];
  mediums: DimRow[];
  pages: DimRow[];
}

export interface DateWindow {
  start: Date;
  end: Date;
  startYmd: string;
  endYmd: string;
  label: string;
}

export interface WeekOverWeekWindows {
  current: DateWindow;
  prior: DateWindow;
}

export function chicagoYmd(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function addDaysYmd(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + n));
  return utc.toISOString().slice(0, 10);
}

/** Midnight America/Chicago for a YYYY-MM-DD calendar date. */
export function startOfChicagoDay(ymd: string): Date {
  for (const off of ["-05:00", "-06:00"] as const) {
    const candidate = new Date(`${ymd}T00:00:00${off}`);
    if (chicagoYmd(candidate) === ymd) return candidate;
  }
  return new Date(`${ymd}T00:00:00-06:00`);
}

function formatYmdLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function windowFromYmds(startYmd: string, endYmd: string): DateWindow {
  return {
    start: startOfChicagoDay(startYmd),
    end: startOfChicagoDay(addDaysYmd(endYmd, 1)),
    startYmd,
    endYmd,
    label: `${formatYmdLabel(startYmd)} – ${formatYmdLabel(endYmd)}`,
  };
}

/**
 * Last 7 complete Central days (ending yesterday) vs the 7 days before that.
 * A Monday morning send covers last Mon–Sun vs the week before.
 */
export function lastSevenVsPriorSeven(now = new Date()): WeekOverWeekWindows {
  const yesterday = addDaysYmd(chicagoYmd(now), -1);
  const currentStart = addDaysYmd(yesterday, -6);
  const priorEnd = addDaysYmd(currentStart, -1);
  const priorStart = addDaysYmd(currentStart, -7);
  return {
    current: windowFromYmds(currentStart, yesterday),
    prior: windowFromYmds(priorStart, priorEnd),
  };
}

function inWindow(iso: string, win: DateWindow): boolean {
  const t = new Date(iso).getTime();
  return t >= win.start.getTime() && t < win.end.getTime();
}

export function computePeriodStats(events: StoredEvent[], leads: StoredLead[], win: DateWindow): PeriodStats {
  const inEvents = events.filter((e) => inWindow(e.createdAt, win));
  const sessionSource = new Map<string, string>();
  const sessionMedium = new Map<string, string>();
  const sessionPage = new Map<string, string>();
  for (const e of inEvents) {
    if (e.type === "opened") {
      sessionSource.set(e.sessionId, e.source?.trim() || "direct");
      sessionMedium.set(e.sessionId, e.medium?.trim() || "none");
      sessionPage.set(e.sessionId, landingPageKey(e.pageUrl));
    }
  }
  for (const e of inEvents) {
    if (!sessionSource.has(e.sessionId)) sessionSource.set(e.sessionId, e.source?.trim() || "direct");
    if (!sessionMedium.has(e.sessionId)) sessionMedium.set(e.sessionId, e.medium?.trim() || "none");
    if (!sessionPage.has(e.sessionId)) sessionPage.set(e.sessionId, landingPageKey(e.pageUrl));
  }

  const opened = new Set<string>();
  const started = new Set<string>();
  const completed = new Set<string>();
  const cta = new Set<string>();
  const form = new Set<string>();
  for (const e of inEvents) {
    if (e.type === "opened") opened.add(e.sessionId);
    else if (e.type === "started") started.add(e.sessionId);
    else if (e.type === "completed") completed.add(e.sessionId);
    else if (e.type === "cta_click") cta.add(e.sessionId);
    else if (e.type === "form_submit") form.add(e.sessionId);
  }
  const converted = new Set<string>([...cta, ...completed, ...form]);

  const inLeads = leads.filter((l) => inWindow(l.createdAt, win));
  const journeyLeads = inLeads.filter((l) => l.outcome === "lead" && !isCallbackFormLead(l)).length;
  const formSubmits = inLeads.filter((l) => isCallbackFormLead(l)).length;
  const referrals = inLeads.filter((l) => l.outcome === "referral").length;
  const declined = inLeads.filter((l) => l.outcome === "declined").length;

  const dim = (keys: Map<string, string>): DimRow[] => {
    const sessions = new Map<string, Set<string>>();
    const acted = new Map<string, Set<string>>();
    for (const sid of opened) {
      const key = keys.get(sid) ?? "—";
      if (!sessions.has(key)) sessions.set(key, new Set());
      sessions.get(key)!.add(sid);
    }
    for (const sid of converted) {
      const key = keys.get(sid) ?? "—";
      if (!acted.has(key)) acted.set(key, new Set());
      acted.get(key)!.add(sid);
    }
    return [...sessions.entries()]
      .map(([key, set]) => ({
        key,
        sessions: set.size,
        converted: acted.get(key)?.size ?? 0,
      }))
      .sort((a, b) => b.sessions - a.sessions || a.key.localeCompare(b.key));
  };

  return {
    opened: opened.size,
    started: started.size,
    converted: converted.size,
    conversionRate: opened.size ? converted.size / opened.size : 0,
    cta: cta.size,
    journeyLeads,
    formSubmits,
    referrals,
    declined,
    sources: dim(sessionSource),
    mediums: dim(sessionMedium),
    pages: dim(sessionPage),
  };
}

export function pct(n: number, d: number): string {
  return d ? `${((n / d) * 100).toFixed(1)}%` : "—";
}

export function deltaPct(curr: number, prev: number): number | null {
  if (!prev && !curr) return 0;
  if (!prev) return null;
  return ((curr - prev) / prev) * 100;
}

export function deltaPts(currRate: number, prevRate: number): number {
  return (currRate - prevRate) * 100;
}
