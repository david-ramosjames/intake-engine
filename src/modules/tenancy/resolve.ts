// =============================================================================
// Tenant resolution
// -----------------------------------------------------------------------------
// The platform decides which Organization a request belongs to from the
// incoming host. Three cases:
//   1. Custom white-label domain      -> Domain.hostname lookup
//   2. Platform subdomain {slug}.root -> Organization.slug lookup
//   3. Platform root domain            -> no tenant (marketing/admin picker)
// Middleware extracts a tenant *hint* from the host (cheap, edge-safe); the DB
// lookup happens in server components/route handlers where Prisma is available.
// =============================================================================

const ROOT_DOMAIN = process.env.PLATFORM_ROOT_DOMAIN ?? "localhost:3000";

export interface TenantHint {
  kind: "custom" | "subdomain" | "platform";
  hostname: string;
  slug?: string;
}

function stripPort(host: string): string {
  return host.split(":")[0] ?? host;
}

/** Derive a tenant hint from a raw Host header. Pure & edge-safe. */
export function tenantHintFromHost(host: string | null | undefined): TenantHint {
  const hostname = stripPort((host ?? "").toLowerCase());
  const root = stripPort(ROOT_DOMAIN.toLowerCase());

  if (!hostname || hostname === root || hostname === "localhost" || hostname === "127.0.0.1") {
    return { kind: "platform", hostname };
  }

  // {slug}.rootdomain -> subdomain tenant
  if (hostname.endsWith(`.${root}`)) {
    const slug = hostname.slice(0, -1 * (root.length + 1));
    // Ignore reserved platform subdomains.
    if (slug && !["www", "app", "admin", "api"].includes(slug)) {
      return { kind: "subdomain", hostname, slug };
    }
    return { kind: "platform", hostname };
  }

  // Anything else is a custom white-label domain resolved via the Domain table.
  return { kind: "custom", hostname };
}
