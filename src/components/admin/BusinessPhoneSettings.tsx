"use client";

// One master phone number for the business. When set, it's shown on every
// journey's call/text buttons and top bar automatically — no need to edit each
// journey — so the number stays in sync with the CallRail swap target.

import { useState } from "react";

const input =
  "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

export function BusinessPhoneSettings({ initialPhone }: { initialPhone: string }) {
  const [phone, setPhone] = useState(initialPhone);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/settings/phone", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not save.");
      setPhone(data.phone ?? "");
      setStatus({ kind: "ok", msg: "Saved. It’s now live on every journey’s call buttons." });
    } catch (err) {
      setStatus({ kind: "err", msg: err instanceof Error ? err.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <input
        className={`${input} w-full max-w-xs`}
        placeholder="(512) 537-3369"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        inputMode="tel"
      />
      <p className="text-xs text-gray-400">
        Applied to the call/text buttons and top bar on <strong>every</strong> journey. Leave blank to use each
        journey&apos;s own numbers. For CallRail call tracking, this must match the number CallRail is set to swap (your
        main tracked line) — otherwise swap.js can&apos;t find it and calls come in on a static number with no session
        or GCLID.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save phone number"}
        </button>
        {status && (
          <span className={`text-sm ${status.kind === "ok" ? "text-green-600" : "text-red-600"}`}>{status.msg}</span>
        )}
      </div>
    </form>
  );
}
