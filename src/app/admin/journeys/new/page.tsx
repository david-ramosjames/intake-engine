import Link from "next/link";
import { templatesForIndustry } from "@/modules/journeys/content/templates";
import { getAdminOrg } from "@/server/currentOrg";
import { industryLabel } from "@/server/store/types";
import { createJourney } from "../../actions";

export const dynamic = "force-dynamic";

export default async function NewJourney() {
  const org = await getAdminOrg();
  const templates = templatesForIndustry(org?.industry);

  return (
    <div className="mx-auto max-w-2xl px-8 py-10">
      <Link href="/admin/journeys" className="text-sm text-gray-500 hover:text-gray-900">
        ← Journeys
      </Link>
      <h1 className="mt-3 text-2xl font-semibold text-gray-900">New Journey</h1>
      <p className="mt-1 text-sm text-gray-500">
        Pick a starter template
        {org ? ` for ${org.name} (${industryLabel(org.industry)})` : ""}.
      </p>

      <form action={createJourney} className="mt-8 space-y-6">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Journey name</label>
          <input
            name="name"
            required
            placeholder="e.g. Car Accident — Facebook"
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">URL slug (optional)</label>
          <input
            name="slug"
            placeholder="auto-generated from the name"
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-gray-700">Template</legend>
          <div className="grid gap-3">
            {templates.map((t, i) => (
              <label
                key={t.key}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 transition hover:bg-gray-50 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50/50 has-[:checked]:ring-1 has-[:checked]:ring-blue-500"
              >
                <input
                  type="radio"
                  name="template"
                  value={t.key}
                  defaultChecked={i === 0}
                  className="mt-1 accent-blue-600"
                />
                <span>
                  <span className="flex items-center gap-2 font-medium text-gray-900">
                    {t.name}
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-500">
                      {t.industry}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-sm text-gray-500">{t.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex gap-3">
          <button
            type="submit"
            className="rounded-full bg-blue-600 px-6 py-3 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            Create Journey
          </button>
          <Link
            href="/admin/journeys"
            className="rounded-full border border-gray-300 px-6 py-3 text-sm text-gray-700 transition hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
