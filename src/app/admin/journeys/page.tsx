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
        <h1 className="text-2xl font-semibold text-gray-900">Welcome</h1>
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

  const journeys = await store.listJourneys(org.id);

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Journeys</h1>
          <p className="mt-1 text-sm text-gray-500">Every acquisition experience for {org.name}.</p>
        </div>
        <Link
          href="/admin/journeys/new"
          className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          New Journey
        </Link>
      </div>

      {!hasDatabase && (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>DEMO mode</strong> — no database configured. Businesses, journeys, and leads you
          create are saved to a local file (<code>./.data/store.json</code>) and persist across restarts.
          Set <code>DATABASE_URL</code> to use Postgres.
        </div>
      )}

      <div className="mt-8 grid gap-4">
        {journeys.map((j) => (
          <div
            key={j.id}
            className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-gray-900">{j.name}</h3>
                <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                  {j.status}
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-400">
                /j/{j.slug} · {j.definition.pages.length} pages ·{" "}
                {j.definition.pages.reduce((n, p) => n + p.components.length, 0)} components
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/j/${j.slug}?org=${org.slug}`}
                className="rounded-full border border-gray-300 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
              >
                Preview
              </Link>
            </div>
          </div>
        ))}

        {journeys.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center text-gray-400">
            No journeys yet.{" "}
            <Link href="/admin/journeys/new" className="text-blue-600 underline">
              Create one
            </Link>{" "}
            to start capturing leads.
          </div>
        )}
      </div>
    </div>
  );
}
