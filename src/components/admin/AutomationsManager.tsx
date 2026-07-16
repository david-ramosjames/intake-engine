"use client";

// Create and manage lead automations. Each automation runs when a lead
// completes (LEAD_COMPLETED) and fires its actions — an email and/or a Slack
// notification. Text fields support {{tokens}} filled from the lead.

import { useState } from "react";

type EmailAction = { type: "email"; to: string; subject: string; body: string };
type SlackAction = { type: "slack"; webhookUrl: string; message: string };
type Action = EmailAction | SlackAction;
type Automation = {
  id: string;
  name: string;
  enabled: boolean;
  journeyId?: string;
  actions: Action[];
};
type JourneyRef = { id: string; name: string };

const input =
  "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

export function AutomationsManager({
  initialAutomations,
  journeys,
  emailConfigured,
}: {
  initialAutomations: Automation[];
  journeys: JourneyRef[];
  emailConfigured: boolean;
}) {
  const [items, setItems] = useState<Automation[]>(initialAutomations);
  const [showForm, setShowForm] = useState(initialAutomations.length === 0);

  const journeyName = (id?: string) => (id ? journeys.find((j) => j.id === id)?.name ?? "A journey" : "All journeys");

  async function toggle(a: Automation) {
    const enabled = !a.enabled;
    setItems((xs) => xs.map((x) => (x.id === a.id ? { ...x, enabled } : x)));
    await fetch(`/api/admin/automations/${a.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled }),
    }).catch(() => {});
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this automation?")) return;
    setItems((xs) => xs.filter((x) => x.id !== id));
    await fetch(`/api/admin/automations/${id}`, { method: "DELETE" }).catch(() => {});
  }

  return (
    <div className="space-y-6">
      {/* Existing automations */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <span className="text-sm font-semibold text-gray-700">Your automations</span>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="rounded-full bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              New automation
            </button>
          )}
        </div>
        {items.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-500">
            No automations yet. Create one below to get notified the moment a lead comes in.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{a.name}</span>
                    {a.actions.map((ac, i) => (
                      <span
                        key={i}
                        className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-600"
                      >
                        {ac.type === "email" ? "✉ Email" : "💬 Slack"}
                      </span>
                    ))}
                  </div>
                  <div className="text-xs text-gray-500">
                    When a lead completes · {journeyName(a.journeyId)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-gray-500">
                    <input type="checkbox" className="accent-blue-600" checked={a.enabled} onChange={() => toggle(a)} />
                    {a.enabled ? "On" : "Off"}
                  </label>
                  <button
                    onClick={() => remove(a.id)}
                    className="rounded-md px-2 py-1 text-sm text-gray-400 transition hover:bg-gray-100 hover:text-red-600"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showForm && (
        <NewAutomationForm
          journeys={journeys}
          emailConfigured={emailConfigured}
          onCancel={items.length > 0 ? () => setShowForm(false) : undefined}
          onCreated={(a) => {
            setItems((xs) => [...xs, a]);
            setShowForm(false);
          }}
        />
      )}
    </div>
  );
}

function NewAutomationForm({
  journeys,
  emailConfigured,
  onCreated,
  onCancel,
}: {
  journeys: JourneyRef[];
  emailConfigured: boolean;
  onCreated: (a: Automation) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState("New lead alert");
  const [journeyId, setJourneyId] = useState("");
  const [emailOn, setEmailOn] = useState(true);
  const [slackOn, setSlackOn] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("New lead: {{name}}");
  const [body, setBody] = useState(
    "You have a new lead from {{journey}}.\n\nName: {{name}}\nPhone: {{phone}}\nEmail: {{email}}\nMessage: {{description}}",
  );
  const [webhookUrl, setWebhookUrl] = useState("");
  const [message, setMessage] = useState("🚨 New lead from {{journey}} — {{name}} ({{phone}})");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const actions: Action[] = [];
    if (emailOn) {
      if (!to.trim()) return setError("Enter an email recipient.");
      actions.push({ type: "email", to, subject, body });
    }
    if (slackOn) {
      if (!webhookUrl.trim()) return setError("Enter your Slack webhook URL.");
      actions.push({ type: "slack", webhookUrl, message });
    }
    if (actions.length === 0) return setError("Turn on Email and/or Slack.");

    setBusy(true);
    try {
      const res = await fetch("/api/admin/automations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, journeyId: journeyId || undefined, trigger: { event: "LEAD_COMPLETED" }, actions }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not create automation.");
      onCreated(data.automation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create automation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-5 rounded-xl border border-gray-200 bg-white p-5">
      <div className="text-sm font-semibold text-gray-700">New automation</div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="mb-1 block text-xs font-medium text-gray-500">Name</span>
          <input className={`${input} w-full`} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-gray-500">Runs for</span>
          <select className={`${input} w-full`} value={journeyId} onChange={(e) => setJourneyId(e.target.value)}>
            <option value="">All journeys</option>
            {journeys.map((j) => (
              <option key={j.id} value={j.id}>
                {j.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
        Trigger: <span className="font-medium text-gray-700">when a lead completes</span>. Use tokens in any field:{" "}
        <code className="rounded bg-white px-1">{"{{name}}"}</code>{" "}
        <code className="rounded bg-white px-1">{"{{phone}}"}</code>{" "}
        <code className="rounded bg-white px-1">{"{{email}}"}</code>{" "}
        <code className="rounded bg-white px-1">{"{{journey}}"}</code>{" "}
        <code className="rounded bg-white px-1">{"{{description}}"}</code> (and any answer key).
      </p>

      {/* Email action */}
      <div className="rounded-lg border border-gray-200 p-4">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input type="checkbox" className="accent-blue-600" checked={emailOn} onChange={(e) => setEmailOn(e.target.checked)} />
          ✉ Send an email
        </label>
        {emailOn && (
          <div className="mt-3 space-y-2">
            {!emailConfigured && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Email delivery isn&apos;t configured yet. Set <code>RESEND_API_KEY</code> and{" "}
                <code>AUTOMATION_EMAIL_FROM</code> in the app&apos;s environment to send emails. You can still save
                this — it&apos;ll start sending once configured.
              </p>
            )}
            <input
              className={`${input} w-full`}
              placeholder="Send to (e.g. intake@yourfirm.com, you@yourfirm.com)"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            <input
              className={`${input} w-full`}
              placeholder="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <textarea
              className={`${input} w-full`}
              rows={5}
              placeholder="Email body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Slack action */}
      <div className="rounded-lg border border-gray-200 p-4">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input type="checkbox" className="accent-blue-600" checked={slackOn} onChange={(e) => setSlackOn(e.target.checked)} />
          💬 Post to Slack
        </label>
        {slackOn && (
          <div className="mt-3 space-y-2">
            <input
              className={`${input} w-full`}
              placeholder="Slack incoming webhook URL (https://hooks.slack.com/services/…)"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
            />
            <input
              className={`${input} w-full`}
              placeholder="Message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <p className="text-xs text-gray-400">
              Create a webhook at api.slack.com → Your app → Incoming Webhooks, pick the channel, and paste the URL
              here.
            </p>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Create automation"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-900">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
