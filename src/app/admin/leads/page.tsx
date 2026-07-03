import { getAdminOrg } from "@/server/currentOrg";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

function fmt(d: string) {
  return new Date(d).toLocaleString();
}

export default async function Leads() {
  const org = await getAdminOrg();
  if (!org) return <div className="px-8 py-10 text-white/50">No organization selected.</div>;

  const leads = await store.listLeads(org.id);

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <h1 className="text-2xl font-semibold">Leads</h1>
      <p className="mt-1 text-sm text-white/50">
        {leads.length} lead{leads.length === 1 ? "" : "s"} for {org.name}.
      </p>

      {leads.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-white/15 p-12 text-center text-white/40">
          No leads yet. Submit a journey (Preview → complete it) and it will appear here.
        </div>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-left text-white/50">
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
            <tbody className="divide-y divide-white/5">
              {leads.map((l) => (
                <tr key={l.id} className="transition hover:bg-white/[0.02]">
                  <td className="px-4 py-3 font-medium">{l.displayName ?? "—"}</td>
                  <td className="px-4 py-3 text-white/60">
                    <div>{l.email ?? "—"}</div>
                    <div className="text-white/40">{l.phone ?? ""}</div>
                  </td>
                  <td className="px-4 py-3 text-white/60">{l.journeySlug}</td>
                  <td className="px-4 py-3">{l.score}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        l.qualified
                          ? "bg-emerald-400/10 text-emerald-300"
                          : "bg-white/10 text-white/50"
                      }`}
                    >
                      {l.qualified ? "Qualified" : "Disqualified"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white/60">{l.source ?? "—"}</td>
                  <td className="px-4 py-3 text-white/40">{fmt(l.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
