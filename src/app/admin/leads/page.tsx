import Link from "next/link";
import { OutcomeBadge, FormSubmitBadge } from "@/components/admin/OutcomeBadge";
import { deriveAttribution } from "@/modules/leads/attribution";
import { isCallbackFormLead } from "@/modules/leads/answers";
import { retagReferralLeads } from "@/modules/leads/service";
import { formatCentral } from "@/lib/datetime";
import { getAdminOrg } from "@/server/currentOrg";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

function fmt(d: string) {
  return formatCentral(d);
}

export default async function Leads({ searchParams }: { searchParams: Promise<{ outcome?: string }> }) {
  const org = await getAdminOrg();
  if (!org) return <div className="px-8 py-10 text-gray-500">No business selected.</div>;

  const { outcome } = await searchParams;
  const all = await retagReferralLeads(org.id, await store.listLeads(org.id));
  const leads = outcome ? all.filter((l) => l.outcome === outcome) : all;

  const counts = {
    all: all.length,
    lead: all.filter((l) => l.outcome === "lead").length,
    referral: all.filter((l) => l.outcome === "referral").length,
    declined: all.filter((l) => l.outcome === "declined").length,
  };
  const tabs: Array<[string, string, number]> = [
    ["All", "", counts.all],
    ["Leads", "lead", counts.lead],
    ["Referrals", "referral", counts.referral],
    ["Not a fit", "declined", counts.declined],
  ];

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-gray-900">Leads</h1>
      <p className="mt-1 text-sm text-gray-500">{all.length} total for {org.name}.</p>

      <div className="mt-5 flex flex-wrap gap-2">
        {tabs.map(([label, value, n]) => {
          const active = (outcome ?? "") === value;
          return (
            <Link
              key={label}
              href={value ? `/admin/leads?outcome=${value}` : "/admin/leads"}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                active ? "bg-blue-600 text-white" : "border border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {label} <span className={active ? "opacity-80" : "text-gray-400"}>{n}</span>
            </Link>
          );
        })}
      </div>

      {leads.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center text-gray-400">
          No leads here yet.
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Outcome</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Journey</th>
                <th className="px-4 py-3 font-medium">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {leads.map((l) => (
                <tr key={l.id} className="cursor-pointer transition hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <Link href={`/admin/leads/${l.id}`} className="block">
                      {l.displayName ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <Link href={`/admin/leads/${l.id}`} className="block">
                      <div>{l.email ?? "—"}</div>
                      <div className="text-gray-400">{l.phone ?? ""}</div>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/leads/${l.id}`} className="flex flex-wrap items-center gap-1.5">
                      <OutcomeBadge outcome={l.outcome} />
                      {isCallbackFormLead(l) ? <FormSubmitBadge /> : null}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <Link href={`/admin/leads/${l.id}`} className="block">
                      {(() => {
                        // Prefer the stored source; for older leads with none,
                        // derive it from the saved context (click ids / referrer).
                        const d = l.source ? { source: l.source, medium: l.medium } : deriveAttribution({}, l.context ?? {});
                        return (
                          <>
                            {d.source ?? "direct"}
                            {d.medium ? <div className="text-gray-400">{d.medium}</div> : null}
                          </>
                        );
                      })()}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <Link href={`/admin/leads/${l.id}`} className="block">
                      {l.journeySlug}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    <Link href={`/admin/leads/${l.id}`} className="block">
                      {fmt(l.createdAt)}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
