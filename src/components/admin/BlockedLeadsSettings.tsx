"use client";

// Spam block list for this business. One name, phone, or email per line.
// Matching submissions still see the thank-you screen, but no lead, Slack,
// CallRail, ads conversion, or contract is created.

import { useState } from "react";

const textarea =
  "min-h-[7.5rem] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

export function BlockedLeadsSettings({
  initialNames,
  initialPhones,
  initialEmails,
}: {
  initialNames: string[];
  initialPhones: string[];
  initialEmails: string[];
}) {
  const [names, setNames] = useState(initialNames.join("\n"));
  const [phones, setPhones] = useState(initialPhones.join("\n"));
  const [emails, setEmails] = useState(initialEmails.join("\n"));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/settings/blocked", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ names, phones, emails }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        names?: string[];
        phones?: string[];
        emails?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not save.");
      setNames((data.names ?? []).join("\n"));
      setPhones((data.phones ?? []).join("\n"));
      setEmails((data.emails ?? []).join("\n"));
      const n = (data.names?.length ?? 0) + (data.phones?.length ?? 0) + (data.emails?.length ?? 0);
      setStatus({
        kind: "ok",
        msg: n ? `Saved. ${n} blocked ${n === 1 ? "entry" : "entries"} — they will not create a lead or Slack post.` : "Saved. Block list is empty.",
      });
    } catch (err) {
      setStatus({ kind: "err", msg: err instanceof Error ? err.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Names (one per line)</label>
          <textarea
            className={textarea}
            placeholder={"Jane Spamerson\nJohn Fake"}
            value={names}
            onChange={(e) => setNames(e.target.value)}
          />
          <p className="mt-1 text-xs text-gray-400">Exact full name, ignoring extra spaces and caps.</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Phone numbers (one per line)</label>
          <textarea
            className={textarea}
            placeholder={"(512) 555-0100\n+1 512 555 0199"}
            value={phones}
            onChange={(e) => setPhones(e.target.value)}
          />
          <p className="mt-1 text-xs text-gray-400">Formatting is ignored — last 10 digits must match.</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Emails (one per line)</label>
          <textarea
            className={textarea}
            placeholder={"spam@example.com"}
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
          />
          <p className="mt-1 text-xs text-gray-400">Case-insensitive exact match.</p>
        </div>
      </div>
      <p className="text-xs text-gray-400">
        If <strong>any</strong> of name, phone, or email matches, the visitor still sees the thank-you / Sign screen,
        but we skip the lead, Slack, CallRail, ChatGPT Ads conversion, and contract create. Does not change tracking
        pixels for real leads.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save blocked contacts"}
        </button>
        {status && (
          <span className={`text-sm ${status.kind === "ok" ? "text-green-600" : "text-red-600"}`}>{status.msg}</span>
        )}
      </div>
    </form>
  );
}
