// Per-org weekly performance email: on/off + recipient list, stored in the
// org settings blob.

export interface WeeklyReportSettings {
  enabled: boolean;
  emails: string[];
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

export function readWeeklyReport(settings: Record<string, unknown> | undefined): WeeklyReportSettings {
  const raw = settings?.weeklyReport;
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    enabled: o.enabled === true,
    emails: asEmails(o.emails),
  };
}

export function parseWeeklyReportEmails(text: string): string[] {
  return asEmails(text);
}
