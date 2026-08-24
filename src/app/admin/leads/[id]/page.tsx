import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteLead } from "@/app/admin/actions";
import { OutcomeBadge } from "@/components/admin/OutcomeBadge";
import { formatCentral } from "@/lib/datetime";
import { deriveAttribution } from "@/modules/leads/attribution";
import { answerRows } from "@/modules/leads/answers";
import { getAdminOrg } from "@/server/currentOrg";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

// Human-readable answer rows using the journey definition for labels/options.
function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-6 border-b border-gray-100 py-2.5 text-sm last:border-0">
      <span className="min-w-0 flex-1 break-words text-gray-500">{label}</span>
      <span className="min-w-0 flex-1 break-words text-right font-medium text-gray-900">{value}</span>
    </div>
  );
}

export default async function LeadDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const org = await getAdminOrg();
  if (!org) notFound();

  const lead = await store.getLead(org.id, id);
  if (!lead) notFound();

  const journey = await store.getJourney(org.id, lead.journeySlug);
  const rows = answerRows(journey?.definition, lead.answers);
  const ctx = lead.context ?? {};

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <Link href="/admin/leads" className="text-sm text-gray-500 hover:text-gray-900">
        ← Leads
      </Link>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">{lead.displayName ?? "Anonymous lead"}</h1>
            <OutcomeBadge outcome={lead.outcome} />
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {formatCentral(lead.createdAt)} · {lead.journeySlug}
          </p>
        </div>
        <form action={deleteLead}>
          <input type="hidden" name="id" value={lead.id} />
          <button
            type="submit"
            className="rounded-full border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
          >
            Delete lead
          </button>
        </form>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-3">
        <div className="space-y-6 md:col-span-2">
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700">Contact</h2>
            <div className="mt-3">
              <Row label="Name" value={lead.displayName} />
              <Row label="Email" value={lead.email} />
              <Row label="Phone" value={lead.phone} />
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700">Answers</h2>
            <div className="mt-3">
              {rows.length === 0 ? (
                <p className="text-sm text-gray-400">No answers captured.</p>
              ) : (
                rows.map((r) => <Row key={r.key} label={r.label} value={r.value} />)
              )}
            </div>
          </section>
        </div>

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700">Source</h2>
          <div className="mt-3">
            {/* Lead with the resolved source/medium/campaign first, so it's
                visible up top — the long raw URLs come after. */}
            {(() => {
              const d = lead.source
                ? { source: lead.source, medium: lead.medium, campaign: lead.campaign }
                : deriveAttribution({}, ctx);
              return (
                <>
                  <Row label="Source" value={d.source ?? "direct"} />
                  <Row label="Medium" value={d.medium} />
                  <Row label="Campaign" value={d.campaign} />
                </>
              );
            })()}
            <Row label="Referrer" value={ctx.referrer || "—"} />
            <Row label="CallRail session" value={ctx.callrailSessionId} />
            <Row label="Click ID — gclid (Google)" value={ctx.gclid} />
            <Row label="Click ID — gbraid (Google)" value={ctx.gbraid} />
            <Row label="Click ID — wbraid (Google)" value={ctx.wbraid} />
            <Row label="Click ID — msclkid (Microsoft/Bing)" value={ctx.msclkid} />
            <Row label="Click ID — fbclid (Meta)" value={ctx.fbclid} />
            <Row label="utm_term" value={ctx.utm_term} />
            <Row label="utm_content" value={ctx.utm_content} />
            <Row label="Page submitted" value={ctx.pageUrl} />
            <Row label="Landing page" value={ctx.landingPage} />
            <Row label="Browser" value={ctx.userAgent} />
          </div>
        </section>
      </div>
    </div>
  );
}
