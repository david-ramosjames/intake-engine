// Runs once when the Node server starts (`next start` on Railway). Kicks off
// the weekly report clock so Settings day/time is enough — no separate cron.

export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { startWeeklyReportScheduler } = await import("@/modules/analytics/weeklyScheduler");
  startWeeklyReportScheduler();
}
