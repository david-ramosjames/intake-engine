import Link from "next/link";
import { getAdminOrg } from "@/server/currentOrg";

export const dynamic = "force-dynamic";

const nav: Array<[label: string, href: string]> = [
  ["Journeys", "/admin"],
  ["Leads", "/admin/leads"],
  ["Analytics", "/admin/analytics"],
  ["Automations", "/admin/automations"],
  ["Organizations", "/admin/organizations"],
  ["Settings", "/admin/settings"],
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const org = await getAdminOrg();
  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-white/10 bg-white/[0.02] p-5 md:flex">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          Intake Engine
        </Link>

        <Link
          href="/admin/organizations"
          className="mt-4 block rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 transition hover:bg-white/5"
        >
          <span className="block text-[10px] uppercase tracking-wide text-white/40">Organization</span>
          <span className="mt-0.5 block truncate text-sm font-medium">
            {org?.name ?? "No organization"}
          </span>
        </Link>

        <nav className="mt-6 space-y-1">
          {nav.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="block rounded-lg px-3 py-2 text-sm text-white/60 transition hover:bg-white/5 hover:text-white"
            >
              {label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex-1">{children}</div>
    </div>
  );
}
