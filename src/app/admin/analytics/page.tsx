import { getAdminOrg } from "@/server/currentOrg";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function groupCount<T>(items: T[], key: (t: T) => string) {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = key(it) || "—";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export default async function Analytics() {
  const org = await getAdminOrg();
  if (!org) return <div className="px-8 py-10 text-gray-500">No business selected.</div>;

  const leads = await store.listLeads(org.id);
  const total = leads.length;
  const qualified = leads.filter((l) => l.qualified).length;
  const rate = total ? Math.round((qualified / total) * 100) : 0;
  const avgScore = total ? Math.round(leads.reduce((n, l) => n + l.score, 0) / total) : 0;

  const bySource = groupCount(leads, (l) => l.source ?? "direct");
  const byJourney = groupCount(leads, (l) => l.journeySlug);

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-gray-900">Analytics</h1>
      <p className="mt-1 text-sm text-gray-500">Lead performance for {org.name}.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-4">
        <Stat label="Total leads" value={String(total)} />
        <Stat label="Qualified" value={String(qualified)} />
        <Stat label="Qualification rate" value={`${rate}%`} />
        <Stat label="Avg. score" value={String(avgScore)} />
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <Breakdown title="By source" rows={bySource} total={total} />
        <Breakdown title="By journey" rows={byJourney} total={total} />
      </div>

      {total === 0 && (
        <p className="mt-8 text-sm text-gray-400">
          No data yet — complete a journey to populate analytics.
        </p>
      )}
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
              <span className="text-gray-700">{k}</span>
              <span className="text-gray-400">{n}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-blue-600"
                style={{ width: `${total ? (n / total) * 100 : 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
