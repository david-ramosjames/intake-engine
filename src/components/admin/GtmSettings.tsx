"use client";

// Google Tag Manager container. One container id installs GTM on the public
// journey pages; GA4, Google Ads, etc. are then configured inside the GTM UI.

import { useState } from "react";

const input =
  "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

export function GtmSettings({
  initialContainerId,
  initialGa4Id,
}: {
  initialContainerId: string;
  initialGa4Id: string;
}) {
  const [containerId, setContainerId] = useState(initialContainerId);
  const [ga4Id, setGa4Id] = useState(initialGa4Id);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/integrations/gtm", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ containerId, ga4Id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not save.");
      setStatus({ kind: "ok", msg: "Saved." });
    } catch (err) {
      setStatus({ kind: "err", msg: err instanceof Error ? err.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-medium text-gray-500">Container ID</label>
            <a
              href="https://support.google.com/tagmanager/answer/6103696"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline"
            >
              How? ↗
            </a>
          </div>
          <input
            className={`${input} w-full`}
            placeholder="GTM-XXXXXX"
            value={containerId}
            onChange={(e) => setContainerId(e.target.value)}
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-medium text-gray-500">GA4 Measurement ID</label>
            <a
              href="https://support.google.com/analytics/answer/12270356"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline"
            >
              How? ↗
            </a>
          </div>
          <input
            className={`${input} w-full`}
            placeholder="G-XXXXXXX"
            value={ga4Id}
            onChange={(e) => setGa4Id(e.target.value)}
          />
        </div>
      </div>
      <p className="text-xs text-gray-400">
        The Container ID installs GTM; the GA4 Measurement ID is baked into the downloadable import so its tags send
        to your Analytics. Leave a field blank to skip it.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save Tag Manager"}
        </button>
        <a
          href="/api/admin/integrations/gtm/import"
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          ⬇ Download GTM setup (.json)
        </a>
        {status && (
          <span className={`text-sm ${status.kind === "ok" ? "text-green-600" : "text-red-600"}`}>{status.msg}</span>
        )}
      </div>
      <p className="text-xs text-gray-400">Tip: click Save first so the download uses your latest IDs.</p>
    </form>
  );
}
