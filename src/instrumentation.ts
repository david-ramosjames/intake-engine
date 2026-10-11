// Runs once when the Node server starts (`next start` on Railway).
// This file is compiled for Edge as well as Node, so it must not import
// app/server modules (crypto, fs, Prisma). It only pokes the Node route
// that already owns the Settings day/time check.

export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const tick = () => {
    const port = process.env.PORT || "3000";
    const secret = (process.env.CRON_SECRET ?? "").trim();
    const headers: Record<string, string> = {};
    if (secret) headers.authorization = `Bearer ${secret}`;
    void fetch(`http://127.0.0.1:${port}/api/cron/weekly-report`, {
      method: "POST",
      headers,
    }).catch(() => {
      /* server not listening yet */
    });
  };

  setTimeout(tick, 20_000);
  setInterval(tick, 60_000);
}
