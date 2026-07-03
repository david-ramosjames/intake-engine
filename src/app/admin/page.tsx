import Link from "next/link";
import { getAdminOrg } from "@/server/currentOrg";
import { hasDatabase } from "@/server/db";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

export default async function AdminJourneys() {
  const org = await getAdminOrg();
  if (!org) {
    return (
      <div className="mx-auto max-w-5xl px-8 py-10">
        <h1 className="text-2xl font-semibold">Welcome</h1>
        <p className="mt-2 text-sm text-white/50">Create your first organization to get started.</p>
        <Link
          href="/admin/organizations"
          className="mt-6 inline-block rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black"
        >
          Create organization
        </Link>
      </div>
    );
  }

  const journeys = await store.listJourneys(org.id);

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Journeys</h1>
          <p className="mt-1 text-sm text-white/50">Every acquisition experience for {org.name}.</p>
        </div>
        <Link
          href="/admin/journeys/new"
          className="rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:opacity-90 focus-ring"
        >
          New Journey
        </Link>
      </div>

      {!hasDatabase && (
        <div className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-200/80">
          <strong>DEMO mode</strong> — no database configured. Organizations, journeys, and leads you
          create are saved to a local file (<code>./.data/store.json</code>) and persist across restarts.
          Set <code>DATABASE_URL</code> to use Postgres.
        </div>
      )}

      <div className="mt-8 grid gap-4">
        {journeys.map((j) => (
          <div
            key={j.id}
            className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-5"
          >
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-medium">{j.name}</h3>
                <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-xs text-emerald-300">
                  {j.status}
                </span>
              </div>
              <p className="mt-1 text-sm text-white/40">
                /j/{j.slug} · {j.definition.pages.length} pages ·{" "}
                {j.definition.pages.reduce((n, p) => n + p.components.length, 0)} components
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/j/${j.slug}?org=${org.slug}`}
                className="rounded-full border border-white/15 px-4 py-2 text-sm transition hover:bg-white/5 focus-ring"
              >
                Preview
              </Link>
            </div>
          </div>
        ))}

        {journeys.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/15 p-12 text-center text-white/40">
            No journeys yet.{" "}
            <Link href="/admin/journeys/new" className="text-white underline">
              Create one
            </Link>{" "}
            to start capturing leads.
          </div>
        )}
      </div>
    </div>
  );
}
