"use client";

import { useRouter } from "next/navigation";

export function prettySource(key: string) {
  const k = key.toLowerCase();
  if (k === "direct") return "Direct";
  if (k === "google") return "Google";
  if (k === "facebook") return "Facebook";
  if (k === "bing") return "Bing";
  if (k === "instagram") return "Instagram";
  return key;
}

export function analyticsHref(opts: { range?: string; from?: string; to?: string; source?: string }) {
  const p = new URLSearchParams();
  if (opts.from || opts.to) {
    if (opts.from) p.set("from", opts.from);
    if (opts.to) p.set("to", opts.to);
  } else {
    p.set("range", opts.range || "30");
  }
  if (opts.source) p.set("source", opts.source);
  return `/admin/analytics?${p.toString()}`;
}

export function AnalyticsSourceFilter({
  sources,
  selected,
  range,
  from,
  to,
}: {
  sources: { key: string; n: number }[];
  selected: string;
  range: string;
  from: string;
  to: string;
}) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-xs text-gray-500">
      Source
      <select
        className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs font-medium text-gray-700"
        value={selected}
        aria-label="Filter by traffic source"
        onChange={(e) => router.push(analyticsHref({ range, from, to, source: e.target.value || undefined }))}
      >
        <option value="">All sources</option>
        {sources.map((s) => (
          <option key={s.key} value={s.key}>
            {prettySource(s.key)} ({s.n})
          </option>
        ))}
      </select>
    </label>
  );
}
