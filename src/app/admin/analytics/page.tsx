import { getAdminOrg } from "@/server/currentOrg";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`mt-2 text-3xl font-semibold ${tone ?? "text-gray-900"}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

function pct(n: number, d: number) {
  return d ? `${((n / d) * 100).toFixed(1)}%` : "—";
}

export default async function Analytics() {
  const org = await getAdminOrg();
  if (!org) return <div className="px-8 py-10 text-gray-500">No business selected.</div>;

  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const events = await store.listEvents(org.id, since);

  // Distinct sessions per funnel stage.
  const s = {
    opened: new Set<string>(),
    started: new Set<string>(),
    completed: new Set<string>(),
    cta: new Set<string>(),
    lead: new Set<string>(),
    referral: new Set<string>(),
    declined: new Set<string>(),
  };
  const bySourceOpen = new Map<string, Set<string>>();
  const byPageOpen = new Map<string, Set<string>>();
  const byDay = new Map<string, { opened: number; started: number; completed: number; cta: number }>();
  const addDay = (day: string, k: "opened" | "started" | "completed" | "cta") => {
    const d = byDay.get(day) ?? { opened: 0, started: 0, completed: 0, cta: 0 };
    d[k]++;
    byDay.set(day, d);
  };
  const addSet = (m: Map<string, Set<string>>, key: string, sid: string) => {
    const set = m.get(key) ?? new Set<string>();
    set.add(sid);
    m.set(key, set);
  };

  for (const e of events) {
    const day = e.createdAt.slice(0, 10);
    if (e.type === "opened") {
      s.opened.add(e.sessionId);
      addDay(day, "opened");
      addSet(bySourceOpen, e.source || "direct", e.sessionId);
      addSet(byPageOpen, e.pageUrl || "—", e.sessionId);
    } else if (e.type === "started") {
      s.started.add(e.sessionId);
      addDay(day, "started");
    } else if (e.type === "completed") {
      s.completed.add(e.sessionId);
      addDay(day, "completed");
      if (e.outcome) s[e.outcome].add(e.sessionId);
    } else if (e.type === "cta_click") {
      s.cta.add(e.sessionId);
      addDay(day, "cta");
    }
  }

  const opened = s.opened.size;
  const started = s.started.size;
  const completed = s.completed.size;
  const nLead = s.lead.size;
  const nReferral = s.referral.size;
  const nDeclined = s.declined.size;
  const cta = s.cta.size;

  const funnel: Array<{ stage: string; n: number; ofOpens: string; step: string; indent?: boolean }> = [
    { stage: "Opened", n: opened, ofOpens: "100.0%", step: "—" },
    { stage: "Started (first answer)", n: started, ofOpens: pct(started, opened), step: pct(started, opened) },
    { stage: "Reached an ending", n: completed, ofOpens: pct(completed, opened), step: pct(completed, started) },
    { stage: "…lead", n: nLead, ofOpens: pct(nLead, opened), step: pct(nLead, completed), indent: true },
    { stage: "…referral", n: nReferral, ofOpens: pct(nReferral, opened), step: pct(nReferral, completed), indent: true },
    { stage: "…not a fit", n: nDeclined, ofOpens: pct(nDeclined, opened), step: pct(nDeclined, completed), indent: true },
    { stage: "Clicked a CTA", n: cta, ofOpens: pct(cta, opened), step: pct(cta, completed) },
  ];

  const topSources = [...bySourceOpen.entries()].map(([k, v]) => [k, v.size] as const).sort((a, b) => b[1] - a[1]);
  const topPages = [...byPageOpen.entries()].map(([k, v]) => [k, v.size] as const).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const days = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14);

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-gray-900">Analytics</h1>
      <p className="mt-1 text-sm text-gray-500">Conversion funnel for {org.name} · last 30 days.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Opened" value={String(opened)} sub="unique sessions" />
        <Stat label="Started" value={String(started)} sub={`${pct(started, opened)} of opens`} />
        <Stat label="Leads" value={String(nLead)} sub={`${pct(nLead, started)} of starts`} tone="text-green-600" />
        <Stat label="Referrals" value={String(nReferral)} sub={`${pct(nReferral, started)} of starts`} tone="text-amber-600" />
        <Stat label="Not a fit" value={String(nDeclined)} sub={`${pct(nDeclined, started)} of starts`} tone="text-gray-500" />
        <Stat label="CTA clicks" value={String(cta)} sub={`${pct(cta, completed)} of completed`} tone="text-blue-600" />
      </div>

      <section className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="font-medium text-gray-900">Conversion funnel</h2>
        <p className="mt-1 text-sm text-gray-500">Each stage counts unique sessions.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 text-left text-gray-400">
              <tr>
                <th className="py-2 font-medium">Stage</th>
                <th className="py-2 font-medium">Sessions</th>
                <th className="py-2 font-medium">% of opens</th>
                <th className="py-2 font-medium">Step conversion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {funnel.map((f) => (
                <tr key={f.stage}>
                  <td className={`py-2.5 ${f.indent ? "pl-6 text-gray-500" : "text-gray-800"}`}>{f.stage}</td>
                  <td className="py-2.5 font-medium text-gray-900">{f.n}</td>
                  <td className="py-2.5 text-gray-500">{f.ofOpens}</td>
                  <td className="py-2.5 text-gray-500">{f.step}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="font-medium text-gray-900">Daily trend</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 text-left text-gray-400">
                <tr>
                  <th className="py-2 font-medium">Day</th>
                  <th className="py-2 font-medium">Opened</th>
                  <th className="py-2 font-medium">Started</th>
                  <th className="py-2 font-medium">Completed</th>
                  <th className="py-2 font-medium">CTA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {days.map(([day, d]) => (
                  <tr key={day}>
                    <td className="py-2.5 text-gray-700">{day}</td>
                    <td className="py-2.5 font-medium text-gray-900">{d.opened}</td>
                    <td className="py-2.5 text-gray-600">{d.started}</td>
                    <td className="py-2.5 text-gray-600">{d.completed}</td>
                    <td className="py-2.5 text-gray-600">{d.cta}</td>
                  </tr>
                ))}
                {days.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-gray-400">
                      No data yet — analytics populate as visitors use your journeys.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-6">
          <Breakdown title="Top sources by opens" rows={topSources} total={opened} />
          <Breakdown title="Top pages by opens" rows={topPages} total={opened} />
        </div>
      </div>
    </div>
  );
}

function Breakdown({ title, rows, total }: { title: string; rows: readonly (readonly [string, number])[]; total: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-medium text-gray-700">{title}</h2>
      <div className="mt-4 space-y-3">
        {rows.length === 0 && <p className="text-sm text-gray-300">No data.</p>}
        {rows.map(([k, n]) => (
          <div key={k}>
            <div className="flex justify-between gap-3 text-sm">
              <span className="truncate text-gray-700">{k}</span>
              <span className="shrink-0 text-gray-400">{n}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-blue-600" style={{ width: `${total ? (n / total) * 100 : 0}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
