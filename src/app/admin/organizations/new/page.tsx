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

export default function NewOrganization() {
  return (
    <div className="mx-auto max-w-2xl px-8 py-10">
      <Link href="/admin" className="text-sm text-white/50 hover:text-white">
        ← Back
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">Add a business</h1>
      <p className="mt-1 text-sm text-white/50">
        Each business is a fully isolated tenant — its own branding, journeys, leads, analytics, and
        settings. Onboard any industry.
      </p>

      <form action={createOrganization} className="mt-8 space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Business name</label>
            <input
              name="name"
              required
              placeholder="e.g. Trucking Chicas"
              className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder-white/30 focus-ring"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">URL slug (optional)</label>
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
          <p className="mt-1.5 text-xs text-white/40">
            Industry is just a hint for templates & analytics — never branching logic.
          </p>
        </div>

        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            className="rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition hover:opacity-90 focus-ring"
          >
            Create business
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
