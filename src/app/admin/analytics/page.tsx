import Link from "next/link";
import { AnalyticsDimFilter } from "@/components/admin/AnalyticsSourceFilter";
import { analyticsHref, landingLang, landingPageKey, prettyLang, prettyMedium, prettyPage, prettySource } from "@/components/admin/analyticsQuery";
import { deriveAttribution } from "@/modules/leads/attribution";
import { isCallbackFormLead } from "@/modules/leads/answers";
import { getAdminOrg } from "@/server/currentOrg";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

const RANGE_PRESETS: Array<[value: string, label: string]> = [
  ["7", "7 days"],
  ["30", "30 days"],
  ["90", "90 days"],
  ["365", "12 months"],
  ["all", "All time"],
];

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`mt-2 text-3xl font-semibold ${tone ?? "text-gray-900"}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

function pct(n: number, d: number) {
  return d ? `${((n / d) * 100).toFixed(1)}%` : "—";
}

export default async function Analytics({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string;
    from?: string;
    to?: string;
    source?: string;
    medium?: string;
    lang?: string;
    page?: string;
  }>;
}) {
  const org = await getAdminOrg();
  if (!org) return <div className="px-8 py-10 text-gray-500">No business selected.</div>;

  const sp = await searchParams;
  const from = typeof sp.from === "string" ? sp.from : "";
  const to = typeof sp.to === "string" ? sp.to : "";
  const range = typeof sp.range === "string" ? sp.range : "30";
  const sourceFilter = typeof sp.source === "string" ? sp.source.trim() : "";
  const mediumFilter = typeof sp.medium === "string" ? sp.medium.trim() : "";
  const langFilter = typeof sp.lang === "string" && (sp.lang === "en" || sp.lang === "es") ? sp.lang : "";
  const pageFilter = typeof sp.page === "string" ? sp.page.trim() : "";

  // Resolve the window: a custom from/to wins, else a preset (default 30 days).
  let sinceISO: string | undefined;
  let untilMs = Infinity;
  let rangeLabel: string;
  if (from || to) {
    sinceISO = from ? new Date(`${from}T00:00:00`).toISOString() : undefined;
    untilMs = to ? new Date(`${to}T23:59:59.999`).getTime() : Infinity;
    rangeLabel = `${from || "start"} → ${to || "now"}`;
  } else if (range === "all") {
    sinceISO = undefined;
    rangeLabel = "all time";
  } else {
    const days = Number(range) || 30;
    sinceISO = new Date(Date.now() - days * 86_400_000).toISOString();
    rangeLabel = `last ${days} days`;
  }
  const usingCustom = Boolean(from || to);

  const allEvents = await store.listEvents(org.id, sinceISO);
  const inWindow = untilMs === Infinity ? allEvents : allEvents.filter((e) => new Date(e.createdAt).getTime() <= untilMs);
  const sinceMs = sinceISO ? new Date(sinceISO).getTime() : 0;
  const allLeads = await store.listLeads(org.id);

  // Attribute each session from its opened event (else the first value we saw).
  const sessionSource = new Map<string, string>();
  const sessionMedium = new Map<string, string>();
  const sessionLang = new Map<string, string>();
  const sessionPage = new Map<string, string>();
  for (const e of inWindow) {
    if (e.type === "opened") {
      sessionSource.set(e.sessionId, e.source?.trim() || "direct");
      sessionMedium.set(e.sessionId, e.medium?.trim() || "none");
      sessionLang.set(e.sessionId, landingLang(e.pageUrl));
      sessionPage.set(e.sessionId, landingPageKey(e.pageUrl));
    }
  }
  for (const e of inWindow) {
    if (!sessionSource.has(e.sessionId)) sessionSource.set(e.sessionId, e.source?.trim() || "direct");
    if (!sessionMedium.has(e.sessionId)) sessionMedium.set(e.sessionId, e.medium?.trim() || "none");
    if (!sessionLang.has(e.sessionId)) sessionLang.set(e.sessionId, landingLang(e.pageUrl));
    if (!sessionPage.has(e.sessionId)) sessionPage.set(e.sessionId, landingPageKey(e.pageUrl));
  }
  const matchesDims = (sid: string, skip?: "source" | "medium" | "lang" | "page") => {
    if (skip !== "source" && sourceFilter && (sessionSource.get(sid) ?? "direct") !== sourceFilter) return false;
    if (skip !== "medium" && mediumFilter && (sessionMedium.get(sid) ?? "none") !== mediumFilter) return false;
    if (skip !== "lang" && langFilter && (sessionLang.get(sid) ?? "en") !== langFilter) return false;
    if (skip !== "page" && pageFilter && (sessionPage.get(sid) ?? "—") !== pageFilter) return false;
    return true;
  };
  const countKeys = (keys: Map<string, string>, include: (sid: string) => boolean) => {
    const counts = new Map<string, number>();
    for (const [sid, key] of keys) {
      if (!include(sid)) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([key, n]) => ({ key, n }))
      .sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
  };
  const sourceOptions = countKeys(sessionSource, (sid) => matchesDims(sid, "source"));
  const mediumOptions = countKeys(sessionMedium, (sid) => matchesDims(sid, "medium"));
  const langOptions = countKeys(sessionLang, (sid) => matchesDims(sid, "lang"));
  const pageOptions = countKeys(sessionPage, (sid) => matchesDims(sid, "page"));
  const events = inWindow.filter((e) => matchesDims(e.sessionId));

  // Distinct sessions per funnel stage.
  const s = {
    opened: new Set<string>(),
    started: new Set<string>(),
    completed: new Set<string>(),
    cta: new Set<string>(),
    form: new Set<string>(),
    lead: new Set<string>(),
    referral: new Set<string>(),
    declined: new Set<string>(),
  };
  const byDay = new Map<string, { opened: number; started: number; completed: number; cta: number }>();
  const addDay = (day: string, k: "opened" | "started" | "completed" | "cta") => {
    const d = byDay.get(day) ?? { opened: 0, started: 0, completed: 0, cta: 0 };
    d[k]++;
    byDay.set(day, d);
  };

  for (const e of events) {
    const day = e.createdAt.slice(0, 10);
    if (e.type === "opened") {
      s.opened.add(e.sessionId);
      addDay(day, "opened");
    } else if (e.type === "started") {
      s.started.add(e.sessionId);
      addDay(day, "started");
    } else if (e.type === "completed") {
      s.completed.add(e.sessionId);
      addDay(day, "completed");
      if (e.outcome === "lead") s.lead.add(e.sessionId);
      else if (e.outcome === "referral") s.referral.add(e.sessionId);
      else if (e.outcome === "declined") s.declined.add(e.sessionId);
    } else if (e.type === "cta_click") {
      s.cta.add(e.sessionId);
      addDay(day, "cta");
    } else if (e.type === "form_submit") {
      s.form.add(e.sessionId);
    }
  }

  const opened = s.opened.size;
  const started = s.started.size;
  const cta = s.cta.size;
  const converted = new Set<string>([...s.cta, ...s.completed, ...s.form]);
  const nConverted = converted.size;

  // Conversion by landing page, ignoring the page filter so every URL's rate
  // is comparable (same source / medium / language window).
  const convertedOnPage = new Map<string, number>();
  {
    const acted = new Set<string>();
    for (const e of inWindow) {
      if (!matchesDims(e.sessionId, "page")) continue;
      if (e.type === "cta_click" || e.type === "completed" || e.type === "form_submit") acted.add(e.sessionId);
    }
    for (const sid of acted) {
      const page = sessionPage.get(sid) ?? "—";
      convertedOnPage.set(page, (convertedOnPage.get(page) ?? 0) + 1);
    }
  }

  // Journey vs form vs referral vs not-a-fit come from lead records so a
  // callback (name/phone/message only, no qualifying questions) counts as a
  // form submit — including older leads from before we recorded form_submit.
  const inWindowLeads = allLeads.filter((l) => {
    const t = new Date(l.createdAt).getTime();
    if (t < sinceMs || t > untilMs) return false;
    const d = l.source
      ? { source: l.source.trim() || "direct", medium: (l.medium ?? "").trim() || "none" }
      : deriveAttribution({}, l.context ?? {});
    const src = (d.source ?? "direct").trim() || "direct";
    const med = (d.medium ?? "none").trim() || "none";
    if (sourceFilter && src !== sourceFilter) return false;
    if (mediumFilter && med !== mediumFilter) return false;
    if (langFilter && landingLang(l.context?.landingPage || l.context?.pageUrl) !== langFilter) return false;
    if (pageFilter && landingPageKey(l.context?.landingPage || l.context?.pageUrl) !== pageFilter) return false;
    return true;
  });
  const nForm = inWindowLeads.filter((l) => isCallbackFormLead(l)).length;
  const nJourneyLead = inWindowLeads.filter((l) => l.outcome === "lead" && !isCallbackFormLead(l)).length;
  const nReferral = inWindowLeads.filter((l) => l.outcome === "referral").length;
  const nDeclined = inWindowLeads.filter((l) => l.outcome === "declined").length;

  const funnel: Array<{ stage: string; n: number; ofOpens: string; step: string; indent?: boolean }> = [
    { stage: "Opened", n: opened, ofOpens: "100.0%", step: "—" },
    { stage: "Started (first answer)", n: started, ofOpens: pct(started, opened), step: pct(started, opened) },
    { stage: "Took an action", n: nConverted, ofOpens: pct(nConverted, opened), step: pct(nConverted, opened) },
    { stage: "…called (CTA)", n: cta, ofOpens: pct(cta, opened), step: pct(cta, nConverted), indent: true },
    { stage: "…journey lead", n: nJourneyLead, ofOpens: pct(nJourneyLead, opened), step: pct(nJourneyLead, nConverted), indent: true },
    { stage: "…form submit", n: nForm, ofOpens: pct(nForm, opened), step: pct(nForm, nConverted), indent: true },
    { stage: "…referral", n: nReferral, ofOpens: pct(nReferral, opened), step: pct(nReferral, nConverted), indent: true },
    { stage: "…not a fit", n: nDeclined, ofOpens: pct(nDeclined, opened), step: pct(nDeclined, nConverted), indent: true },
  ];

  const topSources = sourceOptions.map((row) => [row.key, row.n] as const);
  const topMediums = mediumOptions.map((row) => [row.key, row.n] as const);
  const sourceTotal = sourceOptions.reduce((n, row) => n + row.n, 0);
  const mediumTotal = mediumOptions.reduce((n, row) => n + row.n, 0);
  const topPages = pageOptions.map((row) => [row.key, row.n] as const);
  const pageTotal = pageOptions.reduce((n, row) => n + row.n, 0);
  const days = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14);
  const hrefBase = {
    range,
    from,
    to,
    source: sourceFilter || undefined,
    medium: mediumFilter || undefined,
    lang: langFilter || undefined,
    page: pageFilter || undefined,
  };

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-gray-900">Analytics</h1>
      <p className="mt-1 text-sm text-gray-500">
        Conversion funnel for {org.name} · {rangeLabel}
        {sourceFilter ? ` · ${prettySource(sourceFilter)}` : ""}
        {mediumFilter ? ` · ${prettyMedium(mediumFilter)}` : ""}
        {langFilter ? ` · ${prettyLang(langFilter)}` : ""}
        {pageFilter ? ` · ${prettyPage(pageFilter)}` : ""}.
      </p>

      {/* Date range: quick presets + a custom from/to. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {RANGE_PRESETS.map(([value, label]) => {
          const active = !usingCustom && range === value;
          return (
            <Link
              key={value}
              href={analyticsHref({
                ...hrefBase,
                range: value,
                from: undefined,
                to: undefined,
              })}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {label}
            </Link>
          );
        })}
        <form method="get" className="ml-1 flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-400">or</span>
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700"
            aria-label="From date"
          />
          <span className="text-xs text-gray-400">→</span>
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700"
            aria-label="To date"
          />
          {sourceFilter ? <input type="hidden" name="source" value={sourceFilter} /> : null}
          {mediumFilter ? <input type="hidden" name="medium" value={mediumFilter} /> : null}
          {langFilter ? <input type="hidden" name="lang" value={langFilter} /> : null}
          {pageFilter ? <input type="hidden" name="page" value={pageFilter} /> : null}
          <button
            type="submit"
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              usingCustom ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            Apply
          </button>
        </form>
        <AnalyticsDimFilter
          label="Source"
          param="source"
          options={sourceOptions}
          selected={sourceFilter}
          range={range}
          from={from}
          to={to}
          source={sourceFilter || undefined}
          medium={mediumFilter || undefined}
          lang={langFilter || undefined}
          page={pageFilter || undefined}
        />
        <AnalyticsDimFilter
          label="Medium"
          param="medium"
          options={mediumOptions}
          selected={mediumFilter}
          range={range}
          from={from}
          to={to}
          source={sourceFilter || undefined}
          medium={mediumFilter || undefined}
          lang={langFilter || undefined}
          page={pageFilter || undefined}
        />
        <AnalyticsDimFilter
          label="Page"
          param="page"
          options={pageOptions}
          selected={pageFilter}
          range={range}
          from={from}
          to={to}
          source={sourceFilter || undefined}
          medium={mediumFilter || undefined}
          lang={langFilter || undefined}
          page={pageFilter || undefined}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500">Landing</span>
        {(
          [
            ["", "All", langOptions.reduce((n, r) => n + r.n, 0)],
            ["en", "English", langOptions.find((r) => r.key === "en")?.n ?? 0],
            ["es", "Spanish", langOptions.find((r) => r.key === "es")?.n ?? 0],
          ] as const
        ).map(([value, label, n]) => {
          const active = langFilter === value;
          return (
            <Link
              key={label}
              href={analyticsHref({
                ...hrefBase,
                lang: value || undefined,
              })}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {label} <span className={active ? "opacity-80" : "text-gray-400"}>{n}</span>
            </Link>
          );
        })}
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Opened" value={String(opened)} sub="unique sessions" />
        <Stat
          label="Conversion"
          value={String(nConverted)}
          sub={`${pct(nConverted, opened)} of opens · unique people who took an action`}
          tone="text-green-600"
        />
        <Stat label="Started" value={String(started)} sub={`${pct(started, opened)} of opens`} />
        <Stat label="Call clicks" value={String(cta)} sub={`${pct(cta, opened)} of opens`} tone="text-blue-600" />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Journey leads"
          value={String(nJourneyLead)}
          sub={`${pct(nJourneyLead, opened)} of opens`}
          tone="text-green-600"
        />
        <Stat
          label="Form submits"
          value={String(nForm)}
          sub={`${pct(nForm, opened)} of opens · request a callback`}
          tone="text-green-700"
        />
        <Stat label="Referrals" value={String(nReferral)} sub={`${pct(nReferral, opened)} of opens`} tone="text-amber-600" />
        <Stat label="Not a fit" value={String(nDeclined)} sub={`${pct(nDeclined, opened)} of opens`} tone="text-gray-500" />
      </div>

      <section className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="font-medium text-gray-900">Conversion funnel</h2>
        <p className="mt-1 text-sm text-gray-500">
          Each row counts unique sessions except the action breakdown (journey
          lead, form submit, referral, not a fit), which counts unique leads.
          <strong> Took an action</strong> is conversion: anyone who called,
          submitted the callback form, or finished the questions. A callback
          request (name / phone / message, no qualifying questions) is a form
          submit — still a lead, not a journey lead.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 text-left text-gray-400">
              <tr>
                <th className="py-2 font-medium">Stage</th>
                <th className="py-2 font-medium">Sessions</th>
                <th className="py-2 font-medium">% of opens</th>
                <th className="py-2 font-medium">Step conversion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {funnel.map((f) => (
                <tr key={f.stage}>
                  <td className={`py-2.5 ${f.indent ? "pl-6 text-gray-500" : "text-gray-800"}`}>{f.stage}</td>
                  <td className="py-2.5 font-medium text-gray-900">{f.n}</td>
                  <td className="py-2.5 text-gray-500">{f.ofOpens}</td>
                  <td className="py-2.5 text-gray-500">{f.step}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="font-medium text-gray-900">Daily trend</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 text-left text-gray-400">
                <tr>
                  <th className="py-2 font-medium">Day</th>
                  <th className="py-2 font-medium">Opened</th>
                  <th className="py-2 font-medium">Started</th>
                  <th className="py-2 font-medium">Completed</th>
                  <th className="py-2 font-medium">CTA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {days.map(([day, d]) => (
                  <tr key={day}>
                    <td className="py-2.5 text-gray-700">{day}</td>
                    <td className="py-2.5 font-medium text-gray-900">{d.opened}</td>
                    <td className="py-2.5 text-gray-600">{d.started}</td>
                    <td className="py-2.5 text-gray-600">{d.completed}</td>
                    <td className="py-2.5 text-gray-600">{d.cta}</td>
                  </tr>
                ))}
                {days.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-gray-400">
                      No data yet — analytics populate as visitors use your journeys.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-6">
          <Breakdown
            title="Unique sessions by source"
            rows={topSources}
            total={sourceTotal}
            pretty={prettySource}
            hrefFor={(k) =>
              analyticsHref({
                ...hrefBase,
                source: k === sourceFilter ? undefined : k,
              })
            }
            activeKey={sourceFilter}
          />
          <Breakdown
            title="Unique sessions by medium"
            rows={topMediums}
            total={mediumTotal}
            pretty={prettyMedium}
            hrefFor={(k) =>
              analyticsHref({
                ...hrefBase,
                medium: k === mediumFilter ? undefined : k,
              })
            }
            activeKey={mediumFilter}
          />
          <Breakdown
            title="Unique sessions by page"
            hint="Sessions and % who took an action"
            rows={topPages}
            total={pageTotal}
            pretty={prettyPage}
            rateFor={(k, n) => pct(convertedOnPage.get(k) ?? 0, n)}
            hrefFor={(k) =>
              analyticsHref({
                ...hrefBase,
                page: k === pageFilter ? undefined : k,
              })
            }
            activeKey={pageFilter}
          />
        </div>
      </div>
    </div>
  );
}

function Breakdown({
  title,
  hint,
  rows,
  total,
  hrefFor,
  activeKey,
  pretty = prettySource,
  rateFor,
}: {
  title: string;
  hint?: string;
  rows: readonly (readonly [string, number])[];
  total: number;
  hrefFor?: (key: string) => string;
  activeKey?: string;
  pretty?: (key: string) => string;
  rateFor?: (key: string, n: number) => string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-medium text-gray-700">{title}</h2>
      {hint ? <p className="mt-0.5 text-xs text-gray-400">{hint}</p> : null}
      <div className="mt-4 space-y-3">
        {rows.length === 0 && <p className="text-sm text-gray-300">No data.</p>}
        {rows.map(([k, n]) => {
          const label = pretty(k);
          const active = Boolean(activeKey) && activeKey === k;
          const rate = rateFor?.(k, n);
          const inner = (
            <>
              <div className="flex justify-between gap-3 text-sm">
                <span className={`truncate ${active ? "font-medium text-blue-700" : "text-gray-700"}`}>{label}</span>
                <span className="shrink-0 tabular-nums text-gray-400">
                  {n}
                  {rate ? <span className="ml-2 text-green-700">{rate}</span> : null}
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full ${active ? "bg-blue-700" : "bg-blue-600"}`}
                  style={{ width: `${total ? (n / total) * 100 : 0}%` }}
                />
              </div>
            </>
          );
          return hrefFor ? (
            <Link key={k} href={hrefFor(k)} className="block rounded-md hover:bg-gray-50">
              {inner}
            </Link>
          ) : (
            <div key={k}>{inner}</div>
          );
        })}
      </div>
    </div>
  );
}
