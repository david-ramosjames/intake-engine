import { CallRailSettings } from "@/components/admin/CallRailSettings";
import { GtmSettings } from "@/components/admin/GtmSettings";
import { callRailConfig } from "@/modules/integrations/callrail";
import { getAdminOrg } from "@/server/currentOrg";
import { store } from "@/server/store";
import { industryLabel } from "@/server/store/types";

export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6 border-b border-gray-100 py-3 text-sm last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}

export default async function Settings() {
  const org = await getAdminOrg();
  if (!org) return <div className="px-8 py-10 text-gray-500">No business selected.</div>;

  const settings = await store.getOrgSettings(org.id);
  const cr = callRailConfig(settings);
  const gtm = settings.gtm as { containerId?: string; ga4Id?: string } | undefined;
  const gtmContainerId = (gtm?.containerId ?? "").trim();
  const gtmGa4Id = (gtm?.ga4Id ?? "").trim();

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
      <p className="mt-1 text-sm text-gray-500">Configuration for {org.name}.</p>

      <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700">Business</h2>
        <div className="mt-3">
          <Row label="Name" value={org.name} />
          <Row label="Slug" value={org.slug} />
          <Row label="Industry" value={industryLabel(org.industry)} />
          <Row label="Business ID" value={org.id} />
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700">White-label domains</h2>
        <p className="mt-1 text-sm text-gray-400">
          Point a custom domain at the platform and it will resolve to this business automatically.
        </p>
        <div className="mt-4 space-y-2 text-sm">
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 font-mono text-gray-700">
            {org.slug}.intakeengine.com
          </div>
          <div className="rounded-lg border border-dashed border-gray-300 px-4 py-2.5 text-gray-400">
            + add custom domain (e.g. intake.{org.slug}.com) — coming soon
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-700">Google Tag Manager</h2>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              gtmContainerId ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
            }`}
          >
            {gtmContainerId ? "Installed" : "Off"}
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-400">
          Installs GTM on your journey pages. Add GA4, Google Ads conversions, the Meta pixel, etc. inside the Tag
          Manager UI — no extra code here. (You don&apos;t install Google Analytics separately; add it as a GA4 tag
          in GTM.)
        </p>
        <div className="mt-5">
          <GtmSettings initialContainerId={gtmContainerId} initialGa4Id={gtmGa4Id} />
        </div>

        <div className="mt-6 border-t border-gray-100 pt-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            One-click event setup (import into GTM)
          </div>
          <p className="mt-1 text-xs text-gray-400">
            The <strong>Download GTM setup</strong> button above generates a container file tailored to this business.
            Importing it creates a Custom Event trigger and a GA4 event tag for all five events at once.
          </p>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-gray-600">
            <li>Enter your Container ID and GA4 Measurement ID above and click <strong>Save</strong>.</li>
            <li>Click <strong>Download GTM setup (.json)</strong>.</li>
            <li>
              In Tag Manager, open the container → <strong>Admin → Import Container</strong>. Choose the file, pick
              the <strong>Default (or your) Workspace</strong>, and select <strong>Merge → Rename conflicting</strong>{" "}
              (safest).
            </li>
            <li>Review the 5 triggers + 5 tags, then <strong>Submit / Publish</strong> the container.</li>
          </ol>
          <p className="mt-2 text-xs text-gray-400">
            The import references a <code>GA4 Measurement ID</code> constant (pre-filled from the field above). To also
            fire Google Ads conversions, add your Ads conversion tag on the same triggers.
          </p>
        </div>

        <div className="mt-5 border-t border-gray-100 pt-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Events these pages push (for reference)
          </div>
          <dl className="mt-3 space-y-1.5 text-sm">
            {[
              ["consult_flow_open", "Landing page opened / viewed"],
              ["consult_flow_start", "Visitor started interacting with the flow"],
              ["form_submission", "Landing-page callback form submitted"],
              ["consult_flow_complete", "Lead completed (form or guided flow)"],
              ["consult_flow_phone_click", "A call button was tapped"],
            ].map(([ev, desc]) => (
              <div key={ev} className="flex flex-wrap items-center gap-2">
                <code className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-800">{ev}</code>
                <span className="text-gray-500">{desc}</span>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-gray-400">
            Each event carries a <code>journey</code> parameter (the journey slug); <code>consult_flow_complete</code>{" "}
            includes the <code>outcome</code>.
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-700">CallRail Form Capture</h2>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              cr?.enabled && cr?.apiKey ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
            }`}
          >
            {cr?.enabled && cr?.apiKey ? "Connected" : "Off"}
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-400">
          Forward completed leads into CallRail as form submissions so they show up alongside calls and are
          attributed (GCLID, UTM, landing page) for Google Ads conversions.
        </p>
        <div className="mt-5">
          <CallRailSettings
            initial={{
              enabled: cr?.enabled ?? false,
              accountId: cr?.accountId ?? "",
              companyId: cr?.companyId ?? "",
              formId: cr?.formId ?? "",
              hasKey: Boolean(cr?.apiKey),
            }}
          />
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700">Branding, users & roles, AI</h2>
        <p className="mt-1 text-sm text-gray-400">
          Modeled in the schema (themes, memberships/roles, AI config). Editing UI is on the roadmap.
        </p>
      </div>
    </div>
  );
}
