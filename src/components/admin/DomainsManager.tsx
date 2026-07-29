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
}: {
  initialDomains: Domain[];
  journeys: JourneyRef[];
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
      {/* How it works */}
      <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-gray-600">
        <span className="font-semibold text-gray-800">How this works:</span> connect{" "}
        <span className="font-medium">one domain for your firm</span> (e.g.{" "}
        <code className="rounded bg-white px-1">start.yourfirm.com</code>). Every published journey is then served at
        its own path — <code className="rounded bg-white px-1">/car</code>,{" "}
        <code className="rounded bg-white px-1">/slip-and-fall</code>, etc. The journey you pick below is the default
        shown at the domain root (<code className="rounded bg-white px-1">/</code>). Add{" "}
        <code className="rounded bg-white px-1">?lang=es</code> for Spanish (or let the visitor&apos;s browser decide).
      </div>

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
              <li key={d.id} className="flex items-start justify-between gap-4 px-5 py-3">
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
                    Default (<code className="rounded bg-gray-50 px-1 font-mono">/</code>):{" "}
                    {journeyName(d.journeyId) ?? "First published journey"}
                  </div>
                  {/* Per-journey path URLs (English + Spanish) — use these as the
                      final URLs in Google Ads; the Spanish one opens in Spanish. */}
                  <div className="mt-2">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Journey URLs</div>
                    {journeys.length === 0 ? (
                      <div className="mt-1 text-xs text-gray-400">No published journeys yet.</div>
                    ) : (
                      <div className="mt-1 space-y-1">
                        {journeys.map((j) => (
                          <div key={j.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                            <span className="w-28 shrink-0 truncate font-medium text-gray-600" title={j.name}>
                              {j.name}
                            </span>
                            <code className="rounded bg-gray-50 px-1.5 py-0.5 font-mono text-gray-600">
                              https://{d.hostname}/{j.slug}
                            </code>
                            <span className="text-gray-300">·</span>
                            <code className="rounded bg-gray-50 px-1.5 py-0.5 font-mono text-gray-600">
                              /{j.slug}?lang=es
                            </code>
                          </div>
                        ))}
                      </div>
                    )}
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
        {domains.length > 0 && (
          <p className="border-t border-gray-100 px-5 py-3 text-xs leading-relaxed text-gray-500">
            <span className="font-medium text-gray-700">Language:</span> the page auto-detects the visitor&apos;s
            browser language. To force a language — e.g. for a Spanish Google Ads campaign — set the ad&apos;s final URL
            to the <code className="rounded bg-gray-50 px-1 font-mono">?lang=es</code> link above. Use{" "}
            <code className="rounded bg-gray-50 px-1 font-mono">?lang=en</code> to force English. Visitors can still
            switch with the EN/ES toggle. (Requires Spanish to be enabled on the journey.)
          </p>
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
            <span className="mt-1 block text-xs text-gray-400">Visitors to this domain will land on this journey.</span>
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
        <div className="font-semibold text-gray-700">Make the domain go live (one-time DNS setup)</div>
        <p className="mt-1 text-xs text-gray-500">
          Connecting a domain above tells the app which journey to show. These steps route the actual web traffic to
          the app.
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-5">
          <li>
            In <span className="font-medium">Railway</span>, open this app&apos;s service → Settings → Networking →{" "}
            <span className="font-medium">Custom Domain</span>, and enter the same domain you connected above (e.g.{" "}
            <code className="rounded bg-white px-1">intake.yourfirm.com</code>). Railway will show you a{" "}
            <span className="font-medium">CNAME target</span> (something like{" "}
            <code className="rounded bg-white px-1">xxxx.up.railway.app</code>).
          </li>
          <li>
            At your <span className="font-medium">DNS provider</span> (GoDaddy, Cloudflare, Namecheap…), add a{" "}
            <span className="font-medium">CNAME record</span>: the name is your subdomain (e.g.{" "}
            <code className="rounded bg-white px-1">intake</code>) and the value is the CNAME target Railway gave you.
          </li>
          <li>
            Save and wait for it to go live — usually a few minutes, up to a few hours. Railway issues the HTTPS
            certificate automatically. Then visiting your domain shows the journey.
          </li>
        </ol>
        <p className="mt-3 text-xs text-gray-400">
          Using a root/apex domain (<code className="rounded bg-white px-1">yourfirm.com</code> with no subdomain)?
          Most providers need an ALIAS/ANAME record or &quot;CNAME flattening&quot; instead of a plain CNAME.
        </p>
      </div>
    </div>
  );
}
