"use client";

// CallRail Form Capture settings. Completed leads are forwarded into CallRail
// as form submissions so they appear alongside calls and stay attributed
// (GCLID, UTM, landing page) for Google Ads conversions. The API key is
// write-only from the browser's perspective — we only learn whether one is set.

import { useState } from "react";

type Config = {
  enabled: boolean;
  accountId: string;
  companyId: string;
  formId: string;
  swapUrl: string;
  hasKey: boolean;
};

const input =
  "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

export function CallRailSettings({ initial }: { initial: Config }) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [accountId, setAccountId] = useState(initial.accountId);
  const [companyId, setCompanyId] = useState(initial.companyId);
  const [formId, setFormId] = useState(initial.formId);
  const [swapUrl, setSwapUrl] = useState(initial.swapUrl);
  const [apiKey, setApiKey] = useState(""); // blank = keep existing
  const [hasKey, setHasKey] = useState(initial.hasKey);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  async function sendTest() {
    setTesting(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/integrations/callrail/test", { method: "POST" });
      const data = await res.json();
      if (data.ok) setStatus({ kind: "ok", msg: data.message ?? "CallRail accepted the test." });
      else setStatus({ kind: "err", msg: data.error ?? "CallRail rejected the test." });
    } catch (err) {
      setStatus({ kind: "err", msg: err instanceof Error ? err.message : "Could not reach the server." });
    } finally {
      setTesting(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/integrations/callrail", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled, accountId, companyId, formId, swapUrl, apiKey: apiKey || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not save.");
      setHasKey(data.config.hasKey);
      setApiKey("");
      setStatus({ kind: "ok", msg: "Saved." });
    } catch (err) {
      setStatus({ kind: "err", msg: err instanceof Error ? err.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  }

  const field = (
    label: string,
    node: React.ReactNode,
    hint?: React.ReactNode,
    howHref?: string,
  ) => (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-xs font-medium text-gray-500">{label}</label>
        {howHref && (
          <a href={howHref} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
            How? ↗
          </a>
        )}
      </div>
      {node}
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );

  return (
    <form onSubmit={save} className="space-y-4">
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" className="accent-blue-600" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Forward completed leads into CallRail as form submissions
      </label>

      {field(
        "CallRail Account ID",
        <input
          className={`${input} w-full`}
          placeholder="e.g. 250446909"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
        />,
        <>Find it in the CallRail dashboard URL after <code>/a/</code>, or via Settings → Account.</>,
        "https://apidocs.callrail.com/",
      )}

      {field(
        "CallRail Company ID",
        <input
          className={`${input} w-full`}
          placeholder="e.g. 984308652"
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
        />,
        <>Numeric ID from your swap.js URL — the part after <code>/companies/</code>.</>,
        "https://apidocs.callrail.com/",
      )}

      {field(
        "CallRail API key",
        <input
          className={`${input} w-full`}
          type="password"
          placeholder={hasKey ? "•••••••••• (leave blank to keep)" : "Paste your API key"}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
        />,
        <>Generate at CallRail → Settings → Integrations → API Keys → Create API Key. Stored securely; never shown again.</>,
        "https://apidocs.callrail.com/",
      )}

      {field(
        "Form ID (optional)",
        <input
          className={`${input} w-full`}
          placeholder="e.g. rjl-chat-leads"
          value={formId}
          onChange={(e) => setFormId(e.target.value)}
        />,
        <>Optional label to group these submissions in CallRail&apos;s UI.</>,
      )}

      {/* Separate feature: Dynamic Number Insertion (call tracking). Independent
          of the form-submission fields above — it only needs the swap.js URL. */}
      <div className="border-t border-gray-100 pt-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Call tracking (optional)</div>
        <p className="mt-1 mb-3 text-xs text-gray-400">
          Loads CallRail&apos;s Dynamic Number Insertion script on your journey pages so phone calls get a tracking
          number and are attributed to their source. This is separate from the form capture above — it doesn&apos;t use
          the API key. In CallRail, make sure your journey&apos;s phone number is set as a swap target.
        </p>
        {field(
          "CallRail swap.js URL",
          <input
            className={`${input} w-full`}
            placeholder="//cdn.callrail.com/companies/984308652/…/12/swap.js"
            value={swapUrl}
            onChange={(e) => setSwapUrl(e.target.value)}
          />,
          <>
            CallRail → Settings → Integrations → <strong>JavaScript Snippet</strong>. Paste the <code>src</code> URL from
            the snippet (or the whole <code>&lt;script&gt;</code> tag — we&apos;ll pull the URL out). Leave blank to turn
            call tracking off.
          </>,
          "https://support.callrail.com/hc/en-us/articles/201721993",
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save CallRail settings"}
        </button>
        <button
          type="button"
          onClick={sendTest}
          disabled={testing}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
        >
          {testing ? "Sending…" : "Send test to CallRail"}
        </button>
      </div>
      {status && (
        <p className={`text-sm ${status.kind === "ok" ? "text-green-600" : "text-red-600"}`}>{status.msg}</p>
      )}
      <p className="text-xs text-gray-400">
        Save first, then <strong>Send test</strong> posts a sample form submission using your saved credentials and
        shows CallRail&apos;s exact response — so a bad key or wrong ID is obvious. A real completed lead forwards the
        same way automatically.
      </p>
    </form>
  );
}
