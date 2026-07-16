// Lazy Prisma access.
//
// The client is imported dynamically and only when a database is actually
// configured (`DATABASE_URL` present). This keeps two things true:
//   1. DEMO mode (no DATABASE_URL) needs neither a generated client nor engine
//      binaries — the app builds and runs with zero database infrastructure.
//   2. `@prisma/client` (which is only fully typed/available after
//      `prisma generate`) is never imported unless we genuinely hit Postgres.
//
// The data-access layer (repository/service) is intentionally decoupled from
// the *generated* Prisma types: `getPrisma()` returns a structurally-typed
// client. On Railway, `prisma generate` runs in the build step and provides the
// real, fully-typed client at runtime; the runtime shape is identical.

export const hasDatabase = Boolean(process.env.DATABASE_URL);

// Minimal structural view of the Prisma client surface this app uses. The real
// generated client satisfies this at runtime.
export type Db = {
  organization: AnyDelegate;
  domain: AnyDelegate;
  journey: AnyDelegate;
  journeyVersion: AnyDelegate;
  lead: AnyDelegate;
  automation: AnyDelegate;
  $disconnect: () => Promise<void>;
};
type AnyDelegate = {
  findMany: (args?: unknown) => Promise<any[]>;
  findFirst: (args?: unknown) => Promise<any>;
  findUnique: (args?: unknown) => Promise<any>;
  create: (args?: unknown) => Promise<any>;
  update: (args?: unknown) => Promise<any>;
  updateMany: (args?: unknown) => Promise<any>;
  upsert: (args?: unknown) => Promise<any>;
  delete: (args?: unknown) => Promise<any>;
  deleteMany: (args?: unknown) => Promise<any>;
};

const globalForPrisma = globalThis as unknown as { prisma?: Db };

export async function getPrisma(): Promise<Db> {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const mod: any = await import("@prisma/client");
  const client: Db = new mod.PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
  return client;
}
