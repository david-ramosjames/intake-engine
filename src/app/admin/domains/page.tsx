import { DomainsManager } from "@/components/admin/DomainsManager";
import { getAdminOrg } from "@/server/currentOrg";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

export default async function DomainsPage() {
  const org = await getAdminOrg();
  if (!org) return <div className="px-8 py-10 text-gray-500">No business selected.</div>;

  const [domains, journeys] = await Promise.all([store.listDomains(org.id), store.listJourneys(org.id)]);
  const published = journeys.filter((j) => j.status === "PUBLISHED");

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-gray-900">Domains</h1>
      <p className="mt-1 text-sm text-gray-500">
        Serve {org.name}&apos;s journeys on your own custom domains.
      </p>

      <div className="mt-6">
        <DomainsManager
          initialDomains={domains.map((d) => ({ id: d.id, hostname: d.hostname, journeyId: d.journeyId }))}
          journeys={published.map((j) => ({ id: j.id, name: j.name, slug: j.slug }))}
        />
      </div>
    </div>
  );
}
