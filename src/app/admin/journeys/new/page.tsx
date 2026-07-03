import Link from "next/link";
import { journeyTemplates } from "@/modules/journeys/content/templates";
import { getAdminOrg } from "@/server/currentOrg";
import { createJourney } from "../../actions";

export const dynamic = "force-dynamic";

export default async function NewJourney() {
  const org = await getAdminOrg();

  return (
    <div className="mx-auto max-w-2xl px-8 py-10">
      <Link href="/admin" className="text-sm text-white/50 hover:text-white">
        ← Journeys
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">New Journey</h1>
      <p className="mt-1 text-sm text-white/50">
        Pick a starter template — each is just configuration, so any industry works.
        {org ? ` Creating in ${org.name}.` : ""}
      </p>

      <form action={createJourney} className="mt-8 space-y-6">
        <div>
          <label className="mb-1.5 block text-sm font-medium">Journey name</label>
          <input
            name="name"
            required
            placeholder="e.g. Car Accident — Facebook"
            className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder-white/30 focus-ring"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">URL slug (optional)</label>
          <input
            name="slug"
            placeholder="auto-generated from the name"
            className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder-white/30 focus-ring"
          />
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Template</legend>
          <div className="grid gap-3">
            {journeyTemplates.map((t, i) => (
              <label
                key={t.key}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/12 bg-white/[0.03] p-4 transition hover:bg-white/5 has-[:checked]:border-white/60 has-[:checked]:bg-white/[0.06]"
              >
                <input
                  type="radio"
                  name="template"
                  value={t.key}
                  defaultChecked={i === 0}
                  className="mt-1"
                />
                <span>
                  <span className="flex items-center gap-2 font-medium">
                    {t.name}
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/50">
                      {t.industry}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-sm text-white/50">{t.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex gap-3">
          <button
            type="submit"
            className="rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition hover:opacity-90 focus-ring"
          >
            Create Journey
          </button>
          <Link
            href="/admin"
            className="rounded-full border border-white/15 px-6 py-3 text-sm transition hover:bg-white/5"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
