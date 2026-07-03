import Link from "next/link";
import { getAdminOrg } from "@/server/currentOrg";
import { hasDatabase } from "@/server/db";
import { store } from "@/server/store";
import { industryLabel } from "@/server/store/types";

export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-gray-900">{value}</div>
    </div>
  );
}

export default async function Overview() {
  const org = await getAdminOrg();
  if (!org) {
    return (
      <div className="mx-auto max-w-5xl px-8 py-10">
        <h1 className="text-2xl font-semibold text-gray-900">Welcome to Intake Engine</h1>
        <p className="mt-2 text-sm text-gray-500">Create your first business to get started.</p>
        <Link
          href="/admin/organizations/new"
          className="mt-6 inline-block rounded-full bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          Add a business
        </Link>
      </div>
    );
  }

  const [journeys, leads] = await Promise.all([store.listJourneys(org.id), store.listLeads(org.id)]);
  const qualified = leads.filter((l) => l.qualified).length;
  const rate = leads.length ? Math.round((qualified / leads.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-gray-900">{org.name}</h1>
      <p className="mt-1 text-sm text-gray-500">{industryLabel(org.industry)} · Overview</p>

      {!hasDatabase && (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>DEMO mode</strong> — data is saved to a local file and persists across restarts. Set{" "}
          <code>DATABASE_URL</code> to use Postgres.
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-4">
        <Stat label="Journeys" value={String(journeys.length)} />
        <Stat label="Leads" value={String(leads.length)} />
        <Stat label="Qualified" value={String(qualified)} />
        <Stat label="Qual. rate" value={`${rate}%`} />
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-gray-900">Journeys</h2>
            <Link href="/admin/journeys" className="text-sm text-blue-600 hover:text-blue-700">
              View all →
            </Link>
          </div>
          <div className="mt-4 space-y-2.5">
            {journeys.slice(0, 4).map((j) => (
              <div key={j.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">{j.name}</span>
                <span className="text-gray-400">/j/{j.slug}</span>
              </div>
            ))}
            {journeys.length === 0 && (
              <p className="text-sm text-gray-400">
                No journeys yet.{" "}
                <Link href="/admin/journeys/new" className="text-blue-600 underline">
                  Create one
                </Link>
                .
              </p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-gray-900">Recent leads</h2>
            <Link href="/admin/leads" className="text-sm text-blue-600 hover:text-blue-700">
              View all →
            </Link>
          </div>
          <div className="mt-4 space-y-2.5">
            {leads.slice(0, 5).map((l) => (
              <div key={l.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">{l.displayName ?? l.email ?? "Anonymous"}</span>
                <span className={l.qualified ? "text-green-600" : "text-gray-400"}>
                  {l.qualified ? "Qualified" : "Disqualified"}
                </span>
              </div>
            ))}
            {leads.length === 0 && <p className="text-sm text-gray-400">No leads yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
