import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
import { auth, authEnabled, signOut } from "@/auth";
import { getAdminOrg } from "@/server/currentOrg";
import { store } from "@/server/store";
import { industryLabel } from "@/server/store/types";
import { selectOrganization } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = authEnabled ? await auth() : null;
  if (authEnabled && !session?.user) redirect("/login");

  const [orgs, current] = await Promise.all([store.listOrganizations(), getAdminOrg()]);
  const signedInAs = session?.user?.email ?? (authEnabled ? "Signed in" : "Local dev (no auth)");

  return (
    <div className="admin-light flex min-h-dvh bg-gray-50 text-gray-900">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-gray-200 bg-white md:flex">
        {/* Brand */}
        <div className="flex items-center gap-2.5 border-b border-gray-200 px-5 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
            IE
          </span>
          <span className="text-[15px] font-semibold tracking-tight">Intake Engine</span>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto px-4 py-5">
          {/* Businesses (tenant switcher) */}
          <div className="px-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            Businesses
          </div>
          <div className="mt-2 space-y-0.5">
            {orgs.map((o) => {
              const isCurrent = o.id === current?.id;
              return (
                <form key={o.id} action={selectOrganization}>
                  <input type="hidden" name="orgId" value={o.id} />
                  <button
                    type="submit"
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                      isCurrent
                        ? "bg-blue-50 font-medium text-blue-700"
                        : "text-blue-600 hover:bg-gray-100"
                    }`}
                  >
                    <span className="truncate">{o.name}</span>
                    <span className="ml-2 h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                  </button>
                </form>
              );
            })}
          </div>

          {/* Editing indicator */}
          {current && (
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3">
              <div className="text-[11px] uppercase tracking-wide text-gray-400">Editing</div>
              <div className="mt-0.5 truncate text-sm font-semibold text-gray-900">{current.name}</div>
              <div className="truncate text-xs text-gray-500">{industryLabel(current.industry)}</div>
            </div>
          )}

          {/* Per-business nav */}
          <div className="mt-4">
            <AdminNav />
          </div>

          {/* Create business — deliberately OUTSIDE the per-business nav */}
          <Link
            href="/admin/organizations/new"
            className="mt-5 block px-3 text-sm font-medium text-blue-600 transition hover:text-blue-700"
          >
            + Add another business
          </Link>
        </div>

        {/* Signed-in footer */}
        <div className="border-t border-gray-200 px-5 py-4 text-xs">
          <div className="truncate text-gray-400">
            Signed in as <span className="font-semibold text-gray-700">{signedInAs}</span>
          </div>
          {session?.user ? (
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button
                type="submit"
                className="mt-1 text-gray-500 transition hover:text-gray-800"
              >
                Sign out
              </button>
            </form>
          ) : (
            <Link href="/" className="mt-1 inline-block text-gray-500 transition hover:text-gray-800">
              Home
            </Link>
          )}
        </div>
      </aside>

      <div className="flex-1">{children}</div>
    </div>
  );
}
