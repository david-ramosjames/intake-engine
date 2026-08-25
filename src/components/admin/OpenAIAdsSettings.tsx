"use client";

// ChatGPT Ads Measurement Pixel. Pixel ID is public (loaded on journey pages).
// The optional Conversions API key is write-only from the browser — we only
// learn whether one is set; leaving the field blank keeps the existing key.

import { useState } from "react";

const input =
  "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

export function OpenAIAdsSettings({
  initialPixelId,
  initialHasKey,
}: {
  initialPixelId: string;
  initialHasKey: boolean;
}) {
  const [pixelId, setPixelId] = useState(initialPixelId);
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(initialHasKey);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/integrations/openai-ads", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pixelId, apiKey: apiKey || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not save.");
      setPixelId(data.config?.pixelId ?? pixelId);
      setHasKey(Boolean(data.config?.hasKey));
      setApiKey("");
      setStatus({ kind: "ok", msg: "Saved." });
    } catch (err) {
      setStatus({ kind: "err", msg: err instanceof Error ? err.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-xs font-medium text-gray-500">Pixel ID</label>
          <a
            href="https://developers.openai.com/ads/measurement-pixel"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline"
          >
            How? ↗
          </a>
        </div>
        <input
          className={`${input} w-full font-mono`}
          placeholder="e.g. U2qdf4uT3GAKwX8q4iSN4C"
          value={pixelId}
          onChange={(e) => setPixelId(e.target.value)}
          autoComplete="off"
        />
        <p className="mt-1 text-xs text-gray-400">
          From ChatGPT Ads Manager → Conversions. Leave blank to turn the pixel off.
        </p>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-xs font-medium text-gray-500">Conversions API key (optional)</label>
          <a
            href="https://developers.openai.com/ads/conversions-api"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline"
          >
            How? ↗
          </a>
        </div>
        <input
          className={`${input} w-full`}
          type="password"
          placeholder={hasKey ? "•••••••••• (leave blank to keep)" : "Paste your Conversions API key"}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
        />
        <p className="mt-1 text-xs text-gray-400">
          Recommended. Sends the same <code>lead_created</code> event from the server so conversions still count if the
          browser pixel is blocked. Stored securely; never shown again.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save ChatGPT Ads pixel"}
        </button>
        {status && (
          <span className={`text-sm ${status.kind === "ok" ? "text-green-600" : "text-red-600"}`}>{status.msg}</span>
        )}
      </div>
    </form>
  );
}
