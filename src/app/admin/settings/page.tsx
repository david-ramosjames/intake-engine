import { getAdminOrg } from "@/server/currentOrg";

export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6 border-b border-white/5 py-3 text-sm last:border-0">
      <span className="text-white/50">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export default async function Settings() {
  const org = await getAdminOrg();
  if (!org) return <div className="px-8 py-10 text-white/50">No organization selected.</div>;

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-white/50">Configuration for {org.name}.</p>

      <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <h2 className="text-sm font-medium text-white/70">Organization</h2>
        <div className="mt-3">
          <Row label="Name" value={org.name} />
          <Row label="Slug" value={org.slug} />
          <Row label="Industry" value={org.industry ?? "—"} />
          <Row label="Organization ID" value={org.id} />
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <h2 className="text-sm font-medium text-white/70">White-label domains</h2>
        <p className="mt-1 text-sm text-white/40">
          Point a custom domain at the platform and it will resolve to this organization
          automatically.
        </p>
        <div className="mt-4 space-y-2 text-sm">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 font-mono text-white/70">
            {org.slug}.intakeengine.com
          </div>
          <div className="rounded-lg border border-dashed border-white/10 px-4 py-2.5 text-white/30">
            + add custom domain (e.g. intake.{org.slug}.com) — coming soon
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <h2 className="text-sm font-medium text-white/70">Branding, users & roles, integrations, AI</h2>
        <p className="mt-1 text-sm text-white/40">
          Modeled in the schema (themes, memberships/roles, integrations, AI config). Editing UI is on
          the roadmap.
        </p>
      </div>
    </div>
  );
}
