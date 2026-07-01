import Link from "next/link";
import { getAdminTenant } from "@/server/tenant";

export const dynamic = "force-dynamic";

const nav: Array<[label: string, href: string]> = [
  ["Journeys", "/admin"],
  ["Leads", "/admin/leads"],
  ["Analytics", "/admin/analytics"],
  ["Automations", "/admin/automations"],
  ["Settings", "/admin/settings"],
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getAdminTenant();
  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-white/10 bg-white/[0.02] p-5 md:flex">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          Intake Engine
        </Link>
        <p className="mt-1 truncate text-xs text-white/40">{tenant.organizationName}</p>
        <nav className="mt-8 space-y-1">
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
