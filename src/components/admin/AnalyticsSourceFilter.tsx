"use client";

import { useRouter } from "next/navigation";
import { analyticsHref, prettyMedium, prettyPage, prettySource } from "@/components/admin/analyticsQuery";

export function AnalyticsDimFilter({
  label,
  options,
  selected,
  range,
  from,
  to,
  source,
  medium,
  lang,
  page,
  param,
}: {
  label: string;
  options: { key: string; n: number }[];
  selected: string;
  range: string;
  from: string;
  to: string;
  source?: string;
  medium?: string;
  lang?: string;
  page?: string;
  param: "source" | "medium" | "page";
}) {
  const router = useRouter();
  const pretty = param === "source" ? prettySource : param === "medium" ? prettyMedium : prettyPage;
  const allLabel = param === "source" ? "All sources" : param === "medium" ? "All mediums" : "All pages";
  return (
    <label className="flex items-center gap-2 text-xs text-gray-500">
      {label}
      <select
        className={`rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs font-medium text-gray-700 ${
          param === "page" ? "max-w-[min(100%,24rem)]" : ""
        }`}
        value={selected}
        aria-label={`Filter by ${label.toLowerCase()}`}
        onChange={(e) => {
          const v = e.target.value || undefined;
          router.push(
            analyticsHref({
              range,
              from,
              to,
              source: param === "source" ? v : source,
              medium: param === "medium" ? v : medium,
              lang,
              page: param === "page" ? v : page,
            }),
          );
        }}
      >
        <option value="">{allLabel}</option>
        {selected && !options.some((s) => s.key === selected) ? (
          <option value={selected}>{pretty(selected)}</option>
        ) : null}
        {options.map((s) => (
          <option key={s.key} value={s.key}>
            {pretty(s.key)} ({s.n})
          </option>
        ))}
      </select>
    </label>
  );
}
