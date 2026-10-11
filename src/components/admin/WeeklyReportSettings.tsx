"use client";

// Weekly last-7 vs prior-7 performance email. Same funnel numbers as Analytics.

import { useState } from "react";

const input =
  "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

export function WeeklyReportSettings({
  initialEnabled,
  initialEmails,
  emailConfigured,
}: {
  initialEnabled: boolean;
  initialEmails: string[];
  emailConfigured: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [emails, setEmails] = useState(initialEmails.join("\n"));
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/settings/weekly-report", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled, emails }),
      });
      const data = (await res.json()) as { ok?: boolean; emails?: string[]; enabled?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not save.");
      setEnabled(data.enabled === true);
      setEmails((data.emails ?? []).join("\n"));
      setStatus({
        kind: "ok",
        msg: data.enabled
          ? "Saved. The Monday cron will send this week-vs-last-week report."
          : "Saved. Weekly email is off until you turn it on.",
      });
    } catch (err) {
      setStatus({ kind: "err", msg: err instanceof Error ? err.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  }

  async function sendNow() {
    setSending(true);
    setStatus(null);
    try {
      const saved = await fetch("/api/admin/settings/weekly-report", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled, emails }),
      });
      const savedData = (await saved.json()) as { ok?: boolean; emails?: string[]; enabled?: boolean; error?: string };
      if (!saved.ok || !savedData.ok) throw new Error(savedData.error ?? "Could not save.");
      setEnabled(savedData.enabled === true);
      setEmails((savedData.emails ?? []).join("\n"));
      const res = await fetch("/api/admin/settings/weekly-report", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not send.");
      setStatus({ kind: "ok", msg: "Sent this week’s report to the saved recipients." });
    } catch (err) {
      setStatus({ kind: "err", msg: err instanceof Error ? err.message : "Could not send." });
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      {!emailConfigured && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Email delivery isn&apos;t configured yet. Set <code>RESEND_API_KEY</code> and{" "}
          <code>AUTOMATION_EMAIL_FROM</code> — the same pair lead automations use.
        </p>
      )}
      <label className="flex items-start gap-3 text-sm text-gray-800">
        <input
          type="checkbox"
          className="mt-0.5 accent-blue-600"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <span>
          <span className="font-medium">Send a weekly performance email</span>
          <span className="mt-0.5 block text-xs text-gray-400">
            Last 7 complete days (Central) vs the 7 days before: traffic, conversion, calls, journey leads, callback
            forms, referrals, plus source / medium / page — so you can see what&apos;s working.
          </span>
        </span>
      </label>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">Recipients (one per line, or comma-separated)</label>
        <textarea
          className={`${input} min-h-[5.5rem] w-full font-mono`}
          placeholder={"you@ramosjames.com\nmarketing@ramosjames.com"}
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
        />
      </div>
      <p className="text-xs text-gray-400">
        Schedule a Monday-morning hit to <code className="rounded bg-gray-100 px-1">/api/cron/weekly-report</code> with{" "}
        <code className="rounded bg-gray-100 px-1">Authorization: Bearer $CRON_SECRET</code>. You can also send this
        week&apos;s report immediately after saving recipients.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save weekly email"}
        </button>
        <button
          type="button"
          disabled={sending || busy}
          onClick={() => void sendNow()}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send this week now"}
        </button>
        {status && (
          <span className={`text-sm ${status.kind === "ok" ? "text-green-600" : "text-red-600"}`}>{status.msg}</span>
        )}
      </div>
    </form>
  );
}
