import Link from "next/link";
import { getAdminOrg } from "@/server/currentOrg";
import { hasDatabase } from "@/server/db";
import { store } from "@/server/store";
import { industryLabel } from "@/server/store/types";

export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="text-xs uppercase tracking-wide text-white/40">{label}</div>
      <div className="mt-2 text-3xl font-semibold">{value}</div>
    </div>
  );
}

export default async function Overview() {
  const org = await getAdminOrg();
  if (!org) {
    return (
      <div className="mx-auto max-w-5xl px-8 py-10">
        <h1 className="text-2xl font-semibold">Welcome to Intake Engine</h1>
        <p className="mt-2 text-sm text-white/50">Create your first business to get started.</p>
        <Link
          href="/admin/organizations/new"
          className="mt-6 inline-block rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black"
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
      <h1 className="text-2xl font-semibold">{org.name}</h1>
      <p className="mt-1 text-sm text-white/50">{industryLabel(org.industry)} · Overview</p>

      {!hasDatabase && (
        <div className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-200/80">
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
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Journeys</h2>
            <Link href="/admin/journeys" className="text-sm text-indigo-300 hover:text-indigo-200">
              View all →
            </Link>
          </div>
          <div className="mt-4 space-y-2">
            {journeys.slice(0, 4).map((j) => (
              <div key={j.id} className="flex items-center justify-between text-sm">
                <span className="text-white/70">{j.name}</span>
                <span className="text-white/30">/j/{j.slug}</span>
              </div>
            ))}
            {journeys.length === 0 && (
              <p className="text-sm text-white/40">
                No journeys yet.{" "}
                <Link href="/admin/journeys/new" className="text-white underline">
                  Create one
                </Link>
                .
              </p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Recent leads</h2>
            <Link href="/admin/leads" className="text-sm text-indigo-300 hover:text-indigo-200">
              View all →
            </Link>
          </div>
          <div className="mt-4 space-y-2">
            {leads.slice(0, 5).map((l) => (
              <div key={l.id} className="flex items-center justify-between text-sm">
                <span className="text-white/70">{l.displayName ?? l.email ?? "Anonymous"}</span>
                <span className={l.qualified ? "text-emerald-300" : "text-white/30"}>
                  {l.qualified ? "Qualified" : "Disqualified"}
                </span>
              </div>
            ))}
            {leads.length === 0 && <p className="text-sm text-white/40">No leads yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
