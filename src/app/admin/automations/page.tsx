import { getAdminOrg } from "@/server/currentOrg";

export const dynamic = "force-dynamic";

// The Automation Engine is modeled in the schema (Automation + AutomationRun)
// and is the next module to build (see docs/ROADMAP.md). This page presents the
// planned trigger→action model and an honest empty state rather than a 404.
const ACTIONS = [
  "Send email",
  "Send SMS",
  "Post to Slack / Teams",
  "Call webhook",
  "Update CRM",
  "Assign lead",
  "Create task / appointment",
  "AI: summarize & qualify",
];

export default async function Automations() {
  const org = await getAdminOrg();

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-gray-900">Automations</h1>
      <p className="mt-1 text-sm text-gray-500">
        Event-driven workflows for {org?.name ?? "your business"}: when something happens, run actions.
      </p>

      <div className="mt-8 rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
        <p className="text-gray-600">No automations yet.</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-400">
          The engine is built into the data model (triggers + ordered actions, with delayed &
          conditional runs). The builder UI is on the roadmap.
        </p>
        <button
          disabled
          className="mt-5 cursor-not-allowed rounded-full border border-gray-300 px-5 py-2.5 text-sm text-gray-400"
        >
          New automation (coming soon)
        </button>
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-medium text-gray-700">Trigger → actions</h2>
        <div className="mt-3 rounded-xl border border-gray-200 bg-white p-5 text-sm shadow-sm">
          <div className="text-gray-600">
            <span className="rounded-md bg-gray-100 px-2 py-1 font-mono text-xs text-gray-700">
              LEAD_COMPLETED
            </span>{" "}
            <span className="text-gray-400">then</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {ACTIONS.map((a) => (
              <span
                key={a}
                className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-gray-600"
              >
                {a}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
