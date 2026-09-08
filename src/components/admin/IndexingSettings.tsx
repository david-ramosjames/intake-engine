"use client";

// Business-wide default for whether landing pages tell Google not to index
// them. Individual journeys can override this in their SEO settings.

import { useState } from "react";

export function IndexingSettings({ initialNoindex }: { initialNoindex: boolean }) {
  const [noindex, setNoindex] = useState(initialNoindex);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  async function save(next: boolean) {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/settings/indexing", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ noindexLandings: next }),
      });
      const data = (await res.json()) as { ok?: boolean; noindexLandings?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not save.");
      setNoindex(data.noindexLandings !== false);
      setStatus({
        kind: "ok",
        msg: data.noindexLandings !== false ? "Landing pages are hidden from Google." : "Landing pages can appear in Google.",
      });
    } catch (err) {
      setNoindex(!next);
      setStatus({ kind: "err", msg: err instanceof Error ? err.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="flex items-start gap-3 text-sm text-gray-800">
        <input
          type="checkbox"
          className="mt-0.5 accent-blue-600"
          checked={noindex}
          disabled={busy}
          onChange={(e) => {
            const next = e.target.checked;
            setNoindex(next);
            void save(next);
          }}
        />
        <span>
          <span className="font-medium">Don&apos;t let Google index landing pages</span>
          <span className="mt-0.5 block text-xs text-gray-400">
            Adds a noindex tag so intake URLs don&apos;t show up in search. Google Ads still uses the page title and
            description. A single journey can override this under Search &amp; ads.
          </span>
        </span>
      </label>
      {status && (
        <span className={`text-sm ${status.kind === "ok" ? "text-green-600" : "text-red-600"}`}>{status.msg}</span>
      )}
    </div>
  );
}
