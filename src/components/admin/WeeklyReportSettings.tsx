"use client";

// Weekly last-7 vs prior-7 performance email. Day/time are Central; the running
// app sends then — no Railway cron required.

import { useState } from "react";

const input =
  "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

const DAYS: Array<{ value: number; label: string }> = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function WeeklyReportSettings({
  initialEnabled,
  initialEmails,
  initialWeekday,
  initialHour,
  initialMinute,
  emailConfigured,
}: {
  initialEnabled: boolean;
  initialEmails: string[];
  initialWeekday: number;
  initialHour: number;
  initialMinute: number;
  emailConfigured: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [emails, setEmails] = useState(initialEmails.join("\n"));
  const [weekday, setWeekday] = useState(initialWeekday);
  const [time, setTime] = useState(`${pad(initialHour)}:${pad(initialMinute)}`);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  function clock() {
    const [h, m] = time.split(":").map((x) => Number(x));
    return { hour: Number.isFinite(h) ? h : 8, minute: Number.isFinite(m) ? m : 0 };
  }

  function payload() {
    const { hour, minute } = clock();
    return { enabled, emails, weekday, hour, minute };
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/settings/weekly-report", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        emails?: string[];
        enabled?: boolean;
        weekday?: number;
        hour?: number;
        minute?: number;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not save.");
      setEnabled(data.enabled === true);
      setEmails((data.emails ?? []).join("\n"));
      if (typeof data.weekday === "number") setWeekday(data.weekday);
      if (typeof data.hour === "number" && typeof data.minute === "number") {
        setTime(`${pad(data.hour)}:${pad(data.minute)}`);
      }
      const day = DAYS.find((d) => d.value === (data.weekday ?? weekday))?.label ?? "Monday";
      setStatus({
        kind: "ok",
        msg: data.enabled
          ? `Saved. It will send ${day}s at ${data.hour !== undefined ? pad(data.hour) : pad(clock().hour)}:${data.minute !== undefined ? pad(data.minute) : pad(clock().minute)} Central.`
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
        body: JSON.stringify(payload()),
      });
      const savedData = (await saved.json()) as { ok?: boolean; emails?: string[]; enabled?: boolean; error?: string };
      if (!saved.ok || !savedData.ok) throw new Error(savedData.error ?? "Could not save.");
      setEnabled(savedData.enabled === true);
      setEmails((savedData.emails ?? []).join("\n"));
      const res = await fetch("/api/admin/settings/weekly-report", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not send.");
      setStatus({ kind: "ok", msg: "Sent this week’s report. The scheduled send won’t repeat it this period." });
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
          Email delivery isn&apos;t configured yet. Set the Gmail service account on Railway (
          <code>GMAIL_SERVICE_ACCOUNT_EMAIL</code>, <code>GMAIL_SERVICE_ACCOUNT_PRIVATE_KEY</code>,{" "}
          <code>GMAIL_SEND_AS</code>) — the same account lead emails use.
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
            forms, referrals, plus source / medium / page.
          </span>
        </span>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Send on</label>
          <select className={`${input} w-full`} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
            {DAYS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Time (Central)</label>
          <input className={`${input} w-full`} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
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
        The app sends this itself at the day and time above. No Railway cron needed. It only sends once per week, even
        if the server restarts.
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
