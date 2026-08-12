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

// A single PrismaClient (and therefore a single connection pool) per process,
// in EVERY environment. Cache the initialization PROMISE on globalThis so that
// (a) concurrent callers during startup share one client instead of each
// creating its own, and (b) the client survives module reloads. Caching only in
// non-production previously meant production created a NEW client — and a new
// pool of DB connections — on every getPrisma() call, which exhausts Postgres
// ("too many clients already") under real traffic.
const globalForPrisma = globalThis as unknown as { prismaPromise?: Promise<Db> };

export function getPrisma(): Promise<Db> {
  if (!globalForPrisma.prismaPromise) {
    globalForPrisma.prismaPromise = (async () => {
      const mod: any = await import("@prisma/client");
      return new mod.PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
      }) as Db;
    })();
  }
  return globalForPrisma.prismaPromise;
}
