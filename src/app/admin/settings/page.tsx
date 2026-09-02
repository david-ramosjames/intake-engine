import { BusinessPhoneSettings } from "@/components/admin/BusinessPhoneSettings";
import { CallbackTextSettings } from "@/components/admin/CallbackTextSettings";
import { CallRailSettings } from "@/components/admin/CallRailSettings";
import { GtmSettings } from "@/components/admin/GtmSettings";
import { OpenAIAdsSettings } from "@/components/admin/OpenAIAdsSettings";
import { SigningDefaultsSettings } from "@/components/admin/SigningDefaultsSettings";
import { SiteChatSettings } from "@/components/admin/SiteChatSettings";
import { callRailConfig } from "@/modules/integrations/callrail";
import { openaiAdsConfig } from "@/modules/integrations/openaiAds";
import { normalizeSiteChatPlacement, publicSiteChat, siteChatConfig } from "@/modules/integrations/siteChat";
import { readBusinessPhone } from "@/modules/settings/businessPhone";
import { readCallbackDefaults } from "@/modules/settings/callbackDefaults";
import { readSigningDefaults } from "@/modules/settings/signingDefaults";
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
  const oai = openaiAdsConfig(settings);
  const chat = siteChatConfig(settings);
  const chatPublic = publicSiteChat(chat);
  const gtm = settings.gtm as { containerId?: string; ga4Id?: string } | undefined;
  const gtmContainerId = (gtm?.containerId ?? "").trim();
  const gtmGa4Id = (gtm?.ga4Id ?? "").trim();
  const businessPhone = readBusinessPhone(settings);
  const signingDefaults = readSigningDefaults(settings);
  const callbackText = readCallbackDefaults(settings);
  const callbackSet = Object.values(callbackText).some((v) => v);

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
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-700">Business phone number</h2>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              businessPhone ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
            }`}
          >
            {businessPhone ? "On — used everywhere" : "Off — per-journey numbers"}
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-400">
          Set one number and it appears on the call/text buttons and top bar across all of this business&apos;s
          journeys — so you don&apos;t have to edit each one, and the number stays matched to your CallRail swap target.
        </p>
        <div className="mt-5">
          <BusinessPhoneSettings initialPhone={businessPhone} />
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-700">Default e-signature contracts</h2>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              signingDefaults.templateIdEn || signingDefaults.templateIdEs
                ? "bg-green-50 text-green-700"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {signingDefaults.templateIdEn || signingDefaults.templateIdEs ? "Set" : "Off"}
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-400">
          The DocuSeal contracts new signature requests use (one English, one Spanish). Every journey&apos;s sign step
          inherits these unless it sets its own — so swapping contracts is a one-place change.
        </p>
        <div className="mt-5">
          <SigningDefaultsSettings initialEn={signingDefaults.templateIdEn} initialEs={signingDefaults.templateIdEs} />
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-700">Callback form text</h2>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              callbackSet ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
            }`}
          >
            {callbackSet ? "Customized" : "Using defaults"}
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-400">
          The wording on the &ldquo;Prefer a quick callback?&rdquo; contact card — heading, button, and secure footer,
          in English and Spanish. Set it once and every journey&apos;s callback card uses it, so you don&apos;t edit
          each journey.
        </p>
        <div className="mt-5">
          <CallbackTextSettings initial={callbackText} />
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
              ["consult_flow_phone_click", "Call button on the ending screen tapped"],
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
          <h2 className="text-sm font-medium text-gray-700">ChatGPT Ads pixel</h2>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              oai?.pixelId ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
            }`}
          >
            {oai?.pixelId ? "Installed" : "Off"}
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-400">
          Installs OpenAI&apos;s Measurement Pixel on this business&apos;s journey pages and fires{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs">lead_created</code> when a visitor
          completes a form or callback request. In Ads Manager, create a conversion event for{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs">lead_created</code> so campaign reporting
          can count it.
        </p>
        <div className="mt-5">
          <OpenAIAdsSettings initialPixelId={oai?.pixelId ?? ""} initialHasKey={Boolean(oai?.apiKey)} />
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-700">Chat widget</h2>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              chatPublic ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
            }`}
          >
            {chatPublic ? `On — ${chatPublic.clientId}` : "Off"}
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-400">
          Loads this business&apos;s chat bot on journey pages. Paste the firm&apos;s script, then choose Desktop,
          Mobile, and which landing sections (content block, FAQ) it can appear in. Each business pastes its own
          script so the chat flow can differ.
        </p>
        <div className="mt-5">
          <SiteChatSettings
            initialSnippet={chat?.snippet ?? ""}
            initialClientId={chatPublic?.clientId ?? ""}
            initialPlacement={normalizeSiteChatPlacement(chat?.placement)}
          />
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
              swapUrl: cr?.swapUrl ?? "",
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
