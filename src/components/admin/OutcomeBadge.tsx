import type { LeadOutcome } from "@/server/store/types";

const MAP: Record<LeadOutcome, { label: string; cls: string }> = {
  lead: { label: "Lead", cls: "bg-green-50 text-green-700 ring-green-600/20" },
  referral: { label: "Referral", cls: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  declined: { label: "Not a fit", cls: "bg-gray-100 text-gray-500 ring-gray-500/20" },
};

export function OutcomeBadge({ outcome }: { outcome: LeadOutcome }) {
  const o = MAP[outcome] ?? MAP.declined;
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${o.cls}`}>{o.label}</span>;
}
