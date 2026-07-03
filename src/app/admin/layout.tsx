import Link from "next/link";
import { getAdminOrg } from "@/server/currentOrg";
import { store } from "@/server/store";
import { industryLabel } from "@/server/store/types";
import { selectOrganization } from "./actions";

export const dynamic = "force-dynamic";

// Per-business navigation. Everything here is scoped to the currently-selected
// organization. Creating a business lives OUTSIDE this list (below).
const nav: Array<[label: string, href: string]> = [
  ["Overview", "/admin"],
  ["Journeys", "/admin/journeys"],
  ["Leads", "/admin/leads"],
  ["Analytics", "/admin/analytics"],
  ["Automations", "/admin/automations"],
  ["Settings", "/admin/settings"],
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [orgs, current] = await Promise.all([store.listOrganizations(), getAdminOrg()]);

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-white/10 bg-white/[0.02] md:flex">
        {/* Brand */}
        <div className="flex items-center gap-2.5 border-b border-white/10 px-5 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 text-sm font-bold text-white">
            IE
          </span>
          <span className="text-sm font-semibold tracking-tight">Intake Engine</span>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto px-4 py-5">
          {/* Businesses (tenant switcher) */}
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Businesses</div>
          <div className="mt-2 space-y-0.5">
            {orgs.map((o) => {
              const isCurrent = o.id === current?.id;
              return (
                <form key={o.id} action={selectOrganization}>
                  <input type="hidden" name="orgId" value={o.id} />
                  <button
                    type="submit"
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                      isCurrent ? "bg-indigo-500/10 font-medium text-white" : "text-white/70 hover:bg-white/5"
                    }`}
                  >
                    <span className="truncate">{o.name}</span>
                    <span className="ml-2 h-2 w-2 shrink-0 rounded-full bg-emerald-400" aria-hidden />
                  </button>
                </form>
              );
            })}
          </div>

          {/* Editing indicator */}
          {current && (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3">
              <div className="text-[10px] uppercase tracking-wide text-white/40">Editing</div>
              <div className="mt-0.5 truncate text-sm font-semibold">{current.name}</div>
              <div className="truncate text-xs text-white/50">{industryLabel(current.industry)}</div>
            </div>
          )}

          {/* Per-business nav */}
          <nav className="mt-4 space-y-0.5">
            {nav.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="block rounded-lg px-3 py-2 text-sm text-white/70 transition hover:bg-white/5 hover:text-white"
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* Create business — deliberately OUTSIDE the per-business nav */}
          <Link
            href="/admin/organizations/new"
            className="mt-5 block px-3 text-sm text-indigo-300 transition hover:text-indigo-200"
          >
            + Add another business
          </Link>
        </div>

        {/* Signed-in footer */}
        <div className="border-t border-white/10 px-5 py-4 text-xs">
          <div className="text-white/40">
            Signed in as <span className="font-medium text-white/70">demo@intakeengine.com</span>
          </div>
          <Link href="/" className="mt-1 inline-block text-white/50 transition hover:text-white">
            Sign out
          </Link>
        </div>
      </aside>

      <div className="flex-1">{children}</div>
    </div>
  );
}
