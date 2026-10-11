// In-process weekly send. The Railway `next start` process stays up, so we
// check every minute whether Settings says it's time (Central) and we haven't
// already sent this week's report.

import { lastSevenVsPriorSeven } from "@/modules/analytics/period";
import { buildWeeklyReport, sendWeeklyReportEmail } from "@/modules/analytics/weeklyReport";
import { readWeeklyReport, weeklyReportBlob, type WeeklyReportSettings } from "@/modules/settings/weeklyReport";
import type { StoredOrg } from "@/server/store";
import { store } from "@/server/store";

const TZ = "America/Chicago";

export function chicagoClock(now = new Date()): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const map = Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekday = Math.max(0, days.indexOf(map.weekday ?? "Mon"));
  const hour = Number(map.hour);
  const minute = Number(map.minute);
  return { weekday, minutes: hour * 60 + minute };
}

export function weeklyReportDue(cfg: WeeklyReportSettings, periodEndYmd: string, now = new Date()): boolean {
  if (!cfg.enabled || !cfg.emails.length) return false;
  if (cfg.lastSentPeriodEnd === periodEndYmd) return false;
  const clock = chicagoClock(now);
  if (clock.weekday !== cfg.weekday) return false;
  return clock.minutes >= cfg.hour * 60 + cfg.minute;
}

export async function markWeeklyReportSent(orgId: string, periodEndYmd: string): Promise<void> {
  const settings = await store.getOrgSettings(orgId);
  const cfg = readWeeklyReport(settings);
  await store.saveOrgSettings(orgId, {
    ...settings,
    weeklyReport: weeklyReportBlob({ ...cfg, lastSentPeriodEnd: periodEndYmd }),
  });
}

export async function sendWeeklyReportForOrg(org: StoredOrg): Promise<{ periodEnd: string }> {
  const cfg = readWeeklyReport(await store.getOrgSettings(org.id));
  if (!cfg.emails.length) throw new Error("Add at least one recipient and save first.");
  const report = await buildWeeklyReport(org);
  await sendWeeklyReportEmail(cfg.emails, report);
  await markWeeklyReportSent(org.id, report.windows.current.endYmd);
  return { periodEnd: report.windows.current.endYmd };
}

export async function sendDueWeeklyReports(now = new Date()): Promise<void> {
  const periodEnd = lastSevenVsPriorSeven(now).current.endYmd;
  let orgs: StoredOrg[];
  try {
    orgs = await store.listOrganizations();
  } catch (e) {
    console.error("[weekly-report] list orgs failed", e);
    return;
  }
  for (const org of orgs) {
    try {
      const cfg = readWeeklyReport(await store.getOrgSettings(org.id));
      if (!weeklyReportDue(cfg, periodEnd, now)) continue;
      await sendWeeklyReportForOrg(org);
      console.log("[weekly-report] sent", org.slug, periodEnd);
    } catch (e) {
      console.error("[weekly-report] send failed", org.slug, e);
    }
  }
}

let started = false;

export function startWeeklyReportScheduler(): void {
  if (started) return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  started = true;
  const tick = () => {
    void sendDueWeeklyReports();
  };
  setTimeout(tick, 20_000);
  setInterval(tick, 60_000);
}
