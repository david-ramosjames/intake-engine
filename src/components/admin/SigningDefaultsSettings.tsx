"use client";

// Default e-signature contracts for the business: a DocuSeal template ID for
// English and one for Spanish. Every journey's sign step uses these unless it
// sets its own, so swapping contracts is a one-place change.

import { useState } from "react";

const input =
  "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

export function SigningDefaultsSettings({
  initialEn,
  initialEs,
}: {
  initialEn: string;
  initialEs: string;
}) {
  const [en, setEn] = useState(initialEn);
  const [es, setEs] = useState(initialEs);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/settings/signing", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ templateIdEn: en, templateIdEs: es }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not save.");
      setEn(data.templateIdEn ?? "");
      setEs(data.templateIdEs ?? "");
      setStatus({ kind: "ok", msg: "Saved. New sends use these contracts." });
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
          <label className="mb-1 block text-xs font-medium text-gray-500">
            English contract — DocuSeal template ID
          </label>
          <input className={`${input} w-full`} placeholder="e.g. 12" value={en} onChange={(e) => setEn(e.target.value)} inputMode="numeric" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            Spanish contract — DocuSeal template ID
          </label>
          <input className={`${input} w-full`} placeholder="e.g. 13" value={es} onChange={(e) => setEs(e.target.value)} inputMode="numeric" />
        </div>
      </div>
      <p className="text-xs text-gray-400">
        Used by every journey&apos;s sign step unless that step sets its own template IDs. Find the ID in Sign Flow next
        to each contract. The Spanish contract is used when the journey is viewed in Spanish; if it&apos;s blank, Spanish
        sends fall back to the English contract.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save default contracts"}
        </button>
        {status && (
          <span className={`text-sm ${status.kind === "ok" ? "text-green-600" : "text-red-600"}`}>{status.msg}</span>
        )}
      </div>
    </form>
  );
}
