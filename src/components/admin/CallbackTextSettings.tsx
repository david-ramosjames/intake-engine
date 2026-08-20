"use client";

// Master text for the "quick callback" contact card, English + Spanish. Saved
// once and used across every journey's callback card, so wording is edited in
// one place. Blank fields fall back to the built-in default (shown as the
// placeholder), so Spanish always renders even if left blank.

import { useState } from "react";
import { CALLBACK_TEXT_DEFAULTS } from "@/modules/settings/callbackDefaults";

const input =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

export interface CallbackTextValues {
  heading: string;
  headingEs: string;
  buttonLabel: string;
  buttonLabelEs: string;
  buttonSubtitle: string;
  buttonSubtitleEs: string;
  secureText: string;
  secureTextEs: string;
}

export function CallbackTextSettings({ initial }: { initial: CallbackTextValues }) {
  const [v, setV] = useState<CallbackTextValues>(initial);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const set = (k: keyof CallbackTextValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV((prev) => ({ ...prev, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/settings/callback", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(v),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not save.");
      setV({
        heading: data.heading ?? "",
        headingEs: data.headingEs ?? "",
        buttonLabel: data.buttonLabel ?? "",
        buttonLabelEs: data.buttonLabelEs ?? "",
        buttonSubtitle: data.buttonSubtitle ?? "",
        buttonSubtitleEs: data.buttonSubtitleEs ?? "",
        secureText: data.secureText ?? "",
        secureTextEs: data.secureTextEs ?? "",
      });
      setStatus({ kind: "ok", msg: "Saved. Used across all journeys." });
    } catch (err) {
      setStatus({ kind: "err", msg: err instanceof Error ? err.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  }

  const Field = ({
    label,
    enKey,
    esKey,
  }: {
    label: string;
    enKey: keyof CallbackTextValues;
    esKey: keyof CallbackTextValues;
  }) => (
    <div>
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="mt-1 grid gap-2 sm:grid-cols-2">
        <input
          className={input}
          placeholder={CALLBACK_TEXT_DEFAULTS[enKey]}
          value={v[enKey]}
          onChange={set(enKey)}
          aria-label={`${label} — English`}
        />
        <input
          className={input}
          placeholder={CALLBACK_TEXT_DEFAULTS[esKey]}
          value={v[esKey]}
          onChange={set(esKey)}
          aria-label={`${label} — Spanish`}
        />
      </div>
    </div>
  );

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        <span>English</span>
        <span>Spanish</span>
      </div>
      <Field label="Heading" enKey="heading" esKey="headingEs" />
      <Field label="Button label" enKey="buttonLabel" esKey="buttonLabelEs" />
      <Field label="Button second line" enKey="buttonSubtitle" esKey="buttonSubtitleEs" />
      <Field label="Secure footer" enKey="secureText" esKey="secureTextEs" />
      <p className="text-xs text-gray-400">
        Leave a box blank to use the default shown in grey. The Spanish version is shown when a journey is viewed in
        Spanish.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save callback text"}
        </button>
        {status && (
          <span className={`text-sm ${status.kind === "ok" ? "text-green-600" : "text-red-600"}`}>{status.msg}</span>
        )}
      </div>
    </form>
  );
}
