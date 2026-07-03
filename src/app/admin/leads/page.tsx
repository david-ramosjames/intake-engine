import { getAdminOrg } from "@/server/currentOrg";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

function fmt(d: string) {
  return new Date(d).toLocaleString();
}

export default async function Leads() {
  const org = await getAdminOrg();
  if (!org) return <div className="px-8 py-10 text-gray-500">No business selected.</div>;

  const leads = await store.listLeads(org.id);

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-gray-900">Leads</h1>
      <p className="mt-1 text-sm text-gray-500">
        {leads.length} lead{leads.length === 1 ? "" : "s"} for {org.name}.
      </p>

      {leads.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center text-gray-400">
          No leads yet. Submit a journey (Preview → complete it) and it will appear here.
        </div>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Journey</th>
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {leads.map((l) => (
                <tr key={l.id} className="transition hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{l.displayName ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">
                    <div>{l.email ?? "—"}</div>
                    <div className="text-gray-400">{l.phone ?? ""}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{l.journeySlug}</td>
                  <td className="px-4 py-3 text-gray-900">{l.score}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        l.qualified ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {l.qualified ? "Qualified" : "Disqualified"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{l.source ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-400">{fmt(l.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
