import { getAdminOrg } from "@/server/currentOrg";
import { store } from "@/server/store";
import { createOrganization, selectOrganization } from "../actions";

export const dynamic = "force-dynamic";

const INDUSTRIES = [
  "legal.personal_injury",
  "legal.family",
  "medical.dental",
  "medical.general",
  "contractor.roofing",
  "contractor.hvac",
  "insurance",
  "mortgage",
  "real_estate",
  "other",
];

export default async function Organizations() {
  const [orgs, current] = await Promise.all([store.listOrganizations(), getAdminOrg()]);

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <h1 className="text-2xl font-semibold">Organizations</h1>
      <p className="mt-1 text-sm text-white/50">
        Each organization is a fully isolated tenant — its own branding, journeys, leads, and settings.
      </p>

      <div className="mt-8 space-y-3">
        {orgs.map((o) => {
          const isCurrent = o.id === current?.id;
          return (
            <div
              key={o.id}
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-5"
            >
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{o.name}</h3>
                  {isCurrent && (
                    <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-xs text-emerald-300">
                      Current
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-white/40">
                  {o.slug} · {o.industry ?? "—"}
                </p>
              </div>
              {!isCurrent && (
                <form action={selectOrganization}>
                  <input type="hidden" name="orgId" value={o.id} />
                  <button
                    type="submit"
                    className="rounded-full border border-white/15 px-4 py-2 text-sm transition hover:bg-white/5 focus-ring"
                  >
                    Switch to
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <h2 className="text-lg font-medium">Add organization</h2>
        <p className="mt-1 text-sm text-white/50">Onboard another business — any industry.</p>
        <form action={createOrganization} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Name</label>
              <input
                name="name"
                required
                placeholder="e.g. Trucking Chicas"
                className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder-white/30 focus-ring"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Slug (optional)</label>
              <input
                name="slug"
                placeholder="auto from name"
                className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder-white/30 focus-ring"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Industry</label>
            <select
              name="industry"
              defaultValue="legal.personal_injury"
              className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white focus-ring"
            >
              {INDUSTRIES.map((i) => (
                <option key={i} value={i} className="text-black">
                  {i}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition hover:opacity-90 focus-ring"
          >
            Create organization
          </button>
        </form>
      </div>
    </div>
  );
}
