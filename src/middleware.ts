// Edge middleware: resolve the tenant hint from the incoming host and expose it
// to server components via a request header. The authoritative DB lookup (slug
// or custom domain -> Organization) happens downstream where Prisma runs.

import { NextResponse, type NextRequest } from "next/server";
import { tenantHintFromHost } from "@/modules/tenancy/resolve";

export function middleware(req: NextRequest) {
  const host = req.headers.get("host");
  const hint = tenantHintFromHost(host);

  const headers = new Headers(req.headers);
  headers.set("x-tenant-kind", hint.kind);
  headers.set("x-tenant-host", hint.hostname);
  if (hint.slug) headers.set("x-tenant-slug", hint.slug);

  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Skip static assets & Next internals.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
