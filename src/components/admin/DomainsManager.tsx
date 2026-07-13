"use client";

// Connect and manage custom (white-label) domains for the current business.
// Each domain serves one journey at its root. Verification is handled by DNS +
// the host platform (Railway) issuing TLS; this UI records the mapping and
// shows the setup steps.

import { useState } from "react";

type Domain = { id: string; hostname: string; journeyId?: string };
type JourneyRef = { id: string; name: string; slug: string };

export function DomainsManager({
  initialDomains,
  journeys,
  rootDomain,
}: {
  initialDomains: Domain[];
  journeys: JourneyRef[];
  rootDomain: string;
}) {
  const [domains, setDomains] = useState<Domain[]>(initialDomains);
  const [hostname, setHostname] = useState("");
  const [journeyId, setJourneyId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const journeyName = (id?: string) => journeys.find((j) => j.id === id)?.name;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/domains", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostname, journeyId: journeyId || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not connect domain.");
      setDomains((d) => [...d, data.domain]);
      setHostname("");
      setJourneyId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect domain.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setDomains((d) => d.filter((x) => x.id !== id)); // optimistic
    await fetch(`/api/admin/domains/${id}`, { method: "DELETE" }).catch(() => {});
  }

  const input =
    "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

  return (
    <div className="space-y-6">
      {/* Connected domains */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-3 text-sm font-semibold text-gray-700">
          Connected domains
        </div>
        {domains.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-500">
            No custom domains yet. Connect one below to serve a journey at your own URL.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {domains.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <a
                    href={`https://${d.hostname}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate font-medium text-blue-600 hover:underline"
                  >
                    {d.hostname}
                  </a>
                  <div className="text-xs text-gray-500">
                    Serves: {journeyName(d.journeyId) ?? "First published journey"}
                  </div>
                </div>
                <button
                  onClick={() => remove(d.id)}
                  className="shrink-0 rounded-md px-2 py-1 text-sm text-gray-400 transition hover:bg-gray-100 hover:text-red-600"
                >
                  Disconnect
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add a domain */}
      <form onSubmit={add} className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="text-sm font-semibold text-gray-700">Connect a domain</div>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="mb-1 block text-xs font-medium text-gray-500">Domain</span>
            <input
              className={`${input} w-full`}
              placeholder="intake.yourfirm.com"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
            />
          </label>
          <label className="sm:w-64">
            <span className="mb-1 block text-xs font-medium text-gray-500">Serves journey</span>
            <select className={`${input} w-full`} value={journeyId} onChange={(e) => setJourneyId(e.target.value)}>
              <option value="">First published journey</option>
              {journeys.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={busy || hostname.trim().length < 3}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Connecting…" : "Connect domain"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </form>

      {/* DNS setup */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 text-sm text-gray-600">
        <div className="font-semibold text-gray-700">Point your domain here</div>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5">
          <li>
            At your DNS provider, add a <span className="font-medium">CNAME</span> record from your subdomain
            (e.g. <code className="rounded bg-white px-1">intake</code>) to{" "}
            <code className="rounded bg-white px-1">{rootDomain}</code>.
          </li>
          <li>
            Add the same domain in your hosting platform (Railway → the service → Settings → Networking → Custom
            Domain) so it can issue an HTTPS certificate.
          </li>
          <li>DNS can take a few minutes to a few hours to propagate. Once live, the domain serves the chosen journey at its root.</li>
        </ol>
        <p className="mt-2 text-xs text-gray-400">
          Apex domains (yourfirm.com with no subdomain) may need an ALIAS/ANAME record or the provider&apos;s flattening
          feature instead of a CNAME.
        </p>
      </div>
    </div>
  );
}
