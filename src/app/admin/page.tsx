import Link from "next/link";
import { listJourneysForOrg } from "@/modules/journeys/repository";
import { hasDatabase } from "@/server/db";
import { getAdminTenant } from "@/server/tenant";

export const dynamic = "force-dynamic";

export default async function AdminJourneys() {
  const tenant = await getAdminTenant();
  const journeys = await listJourneysForOrg(tenant.organizationId);

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Journeys</h1>
          <p className="mt-1 text-sm text-white/50">
            Every acquisition experience for {tenant.organizationName}.
          </p>
        </div>
        <button
          className="rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:opacity-90 focus-ring"
          type="button"
        >
          New Journey
        </button>
      </div>

      {!hasDatabase && (
        <div className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-200/80">
          Running in <strong>DEMO mode</strong> — no database configured. Journeys shown are served from
          seed content. Set <code>DATABASE_URL</code> and run <code>npm run db:seed</code> to persist.
        </div>
      )}

      <div className="mt-8 grid gap-4">
        {journeys.map((j) => (
          <div
            key={j.journeyId}
            className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-5"
          >
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-medium">{j.name}</h3>
                <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-xs text-emerald-300">
                  Published
                </span>
              </div>
              <p className="mt-1 text-sm text-white/40">
                /j/{j.slug} · {j.definition.pages.length} pages ·{" "}
                {j.definition.pages.reduce((n, p) => n + p.components.length, 0)} components
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/j/${j.slug}`}
                className="rounded-full border border-white/15 px-4 py-2 text-sm transition hover:bg-white/5 focus-ring"
              >
                Preview
              </Link>
              <button
                className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/60 transition hover:bg-white/5 focus-ring"
                type="button"
              >
                Edit
              </button>
            </div>
          </div>
        ))}

        {journeys.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/15 p-12 text-center text-white/40">
            No journeys yet. Create one to start capturing leads.
          </div>
        )}
      </div>
    </div>
  );
}
