import Link from "next/link";
import { createOrganization } from "../../actions";

export const dynamic = "force-dynamic";

const INDUSTRIES = [
  "legal.personal_injury",
  "legal.family",
  "legal.criminal_defense",
  "medical.dental",
  "medical.general",
  "medical.veterinary",
  "contractor.roofing",
  "contractor.hvac",
  "contractor.plumbing",
  "insurance",
  "mortgage",
  "financial_advisor",
  "real_estate",
  "recruiting",
  "other",
];

const inputCls =
  "w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

export default function NewOrganization() {
  return (
    <div className="mx-auto max-w-2xl px-8 py-10">
      <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-900">
        ← Back
      </Link>
      <h1 className="mt-3 text-2xl font-semibold text-gray-900">Add a business</h1>
      <p className="mt-1 text-sm text-gray-500">
        Each business is a fully isolated tenant — its own branding, journeys, leads, analytics, and
        settings. Onboard any industry.
      </p>

      <form action={createOrganization} className="mt-8 space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Business name</label>
            <input name="name" required placeholder="e.g. Trucking Chicas" className={inputCls} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">URL slug (optional)</label>
            <input name="slug" placeholder="auto from name" className={inputCls} />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Industry</label>
          <select name="industry" defaultValue="legal.personal_injury" className={inputCls}>
            {INDUSTRIES.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-gray-400">
            Industry is just a hint for templates & analytics — never branching logic.
          </p>
        </div>

        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            className="rounded-full bg-blue-600 px-6 py-3 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            Create business
          </button>
          <Link
            href="/admin"
            className="rounded-full border border-gray-300 px-6 py-3 text-sm text-gray-700 transition hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
