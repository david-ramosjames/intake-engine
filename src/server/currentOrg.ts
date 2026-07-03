// Resolves the "current" organization for the ADMIN (the private dashboard),
// which is org-agnostic by host. Selection is stored in a cookie so a user can
// switch between organizations they manage. The PUBLIC runtime, by contrast,
// resolves its org from the request host (see runtime page).

import { cookies } from "next/headers";
import { store } from "./store";
import type { StoredOrg } from "./store/types";

export const ADMIN_ORG_COOKIE = "admin_org";

export async function getAdminOrg(): Promise<StoredOrg | null> {
  const orgs = await store.listOrganizations();
  if (orgs.length === 0) return null;

  const cookieStore = await cookies();
  const selected = cookieStore.get(ADMIN_ORG_COOKIE)?.value;
  if (selected) {
    const match = orgs.find((o) => o.id === selected);
    if (match) return match;
  }
  return orgs[0] ?? null;
}
