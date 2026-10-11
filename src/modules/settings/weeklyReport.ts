// Per-org weekly performance email: on/off, recipients, and when to send
// (America/Chicago). lastSentPeriodEnd prevents a second send for the same week.

export interface WeeklyReportSettings {
  enabled: boolean;
  emails: string[];
  /** 0 = Sunday … 6 = Saturday. Default Monday. */
  weekday: number;
  hour: number;
  minute: number;
  lastSentPeriodEnd?: string;
}

function asEmails(v: unknown): string[] {
  if (typeof v === "string") {
    return v
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean);
}

function intIn(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  return i < min || i > max ? fallback : i;
}

export function readWeeklyReport(settings: Record<string, unknown> | undefined): WeeklyReportSettings {
  const raw = settings?.weeklyReport;
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    enabled: o.enabled === true,
    emails: asEmails(o.emails),
    weekday: intIn(o.weekday, 0, 6, 1),
    hour: intIn(o.hour, 0, 23, 8),
    minute: intIn(o.minute, 0, 59, 0),
    lastSentPeriodEnd: typeof o.lastSentPeriodEnd === "string" ? o.lastSentPeriodEnd : undefined,
  };
}

export function parseWeeklyReportEmails(text: string): string[] {
  return asEmails(text);
}

export function weeklyReportBlob(cfg: WeeklyReportSettings): Record<string, unknown> {
  return {
    enabled: cfg.enabled,
    emails: cfg.emails,
    weekday: cfg.weekday,
    hour: cfg.hour,
    minute: cfg.minute,
    ...(cfg.lastSentPeriodEnd ? { lastSentPeriodEnd: cfg.lastSentPeriodEnd } : {}),
  };
}
