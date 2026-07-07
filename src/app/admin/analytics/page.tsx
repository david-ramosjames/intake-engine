import { getAdminOrg } from "@/server/currentOrg";
import { store } from "@/server/store";
import type { StoredLead } from "@/server/store/types";

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

function groupCount<T>(items: T[], key: (t: T) => string) {
  const m = new Map<string, number>();
  for (const it of items) m.set(key(it) || "—", (m.get(key(it) || "—") ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export default async function Analytics() {
  const org = await getAdminOrg();
  if (!org) return <div className="px-8 py-10 text-gray-500">No business selected.</div>;

  const leads = await store.listLeads(org.id);
  const total = leads.length;
  const nLead = leads.filter((l) => l.outcome === "lead").length;
  const nReferral = leads.filter((l) => l.outcome === "referral").length;
  const nDeclined = leads.filter((l) => l.outcome === "declined").length;

  const source = (l: StoredLead) => l.source ?? l.context?.utm_source ?? "direct";
  const bySource = groupCount(leads, source);
  const byJourney = groupCount(leads, (l) => l.journeySlug);

  // Daily trend (last 14 days present in data).
  const byDay = new Map<string, { total: number; lead: number; referral: number; declined: number }>();
  for (const l of leads) {
    const day = l.createdAt.slice(0, 10);
    const d = byDay.get(day) ?? { total: 0, lead: 0, referral: 0, declined: 0 };
    d.total++;
    d[l.outcome === "lead" ? "lead" : l.outcome === "referral" ? "referral" : "declined"]++;
    byDay.set(day, d);
  }
  const days = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14);

  const funnel: Array<[string, number, string]> = [
    ["Completed a journey", total, "100.0%"],
    ["→ Lead (success)", nLead, pct(nLead, total)],
    ["→ Referral", nReferral, pct(nReferral, total)],
    ["→ Not a fit (decline)", nDeclined, pct(nDeclined, total)],
  ];

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-gray-900">Analytics</h1>
      <p className="mt-1 text-sm text-gray-500">Outcomes for {org.name}.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Completed" value={String(total)} sub="reached an ending" />
        <Stat label="Leads" value={String(nLead)} sub={`${pct(nLead, total)} of completed`} tone="text-green-600" />
        <Stat label="Referrals" value={String(nReferral)} sub={`${pct(nReferral, total)} of completed`} tone="text-amber-600" />
        <Stat label="Not a fit" value={String(nDeclined)} sub={`${pct(nDeclined, total)} of completed`} tone="text-gray-500" />
      </div>

      <section className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="font-medium text-gray-900">Outcome funnel</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 text-left text-gray-400">
              <tr>
                <th className="py-2 font-medium">Stage</th>
                <th className="py-2 font-medium">Count</th>
                <th className="py-2 font-medium">% of completed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {funnel.map(([stage, n, p]) => (
                <tr key={stage}>
                  <td className="py-2.5 text-gray-700">{stage}</td>
                  <td className="py-2.5 font-medium text-gray-900">{n}</td>
                  <td className="py-2.5 text-gray-500">{p}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Breakdown title="By source" rows={bySource} total={total} />
        <Breakdown title="By journey" rows={byJourney} total={total} />
      </div>

      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="font-medium text-gray-900">Daily trend</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 text-left text-gray-400">
              <tr>
                <th className="py-2 font-medium">Day</th>
                <th className="py-2 font-medium">Completed</th>
                <th className="py-2 font-medium">Leads</th>
                <th className="py-2 font-medium">Referrals</th>
                <th className="py-2 font-medium">Not a fit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {days.map(([day, d]) => (
                <tr key={day}>
                  <td className="py-2.5 text-gray-700">{day}</td>
                  <td className="py-2.5 font-medium text-gray-900">{d.total}</td>
                  <td className="py-2.5 text-green-600">{d.lead}</td>
                  <td className="py-2.5 text-amber-600">{d.referral}</td>
                  <td className="py-2.5 text-gray-500">{d.declined}</td>
                </tr>
              ))}
              {days.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-400">
                    No data yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Breakdown({ title, rows, total }: { title: string; rows: [string, number][]; total: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-medium text-gray-700">{title}</h2>
      <div className="mt-4 space-y-3">
        {rows.length === 0 && <p className="text-sm text-gray-300">No data.</p>}
        {rows.map(([k, n]) => (
          <div key={k}>
            <div className="flex justify-between text-sm">
              <span className="truncate text-gray-700">{k}</span>
              <span className="text-gray-400">{n}</span>
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
