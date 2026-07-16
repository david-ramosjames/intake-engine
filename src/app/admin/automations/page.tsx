import { AutomationsManager } from "@/components/admin/AutomationsManager";
import { getAdminOrg } from "@/server/currentOrg";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

export default async function Automations() {
  const org = await getAdminOrg();

  if (!org) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-10">
        <h1 className="text-2xl font-semibold text-gray-900">Automations</h1>
        <p className="mt-2 text-sm text-gray-500">Create a business first to add automations.</p>
      </div>
    );
  }

  const [automations, journeys] = await Promise.all([
    store.listAutomations(org.id),
    store.listJourneys(org.id),
  ]);
  const emailConfigured = Boolean(process.env.RESEND_API_KEY && process.env.AUTOMATION_EMAIL_FROM);

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-gray-900">Automations</h1>
      <p className="mt-1 text-sm text-gray-500">
        When a lead comes in for {org.name}, automatically send an email and/or a Slack notification.
      </p>

      <div className="mt-8">
        <AutomationsManager
          initialAutomations={automations.map((a) => ({
            id: a.id,
            name: a.name,
            enabled: a.enabled,
            journeyId: a.journeyId,
            actions: a.actions,
          }))}
          journeys={journeys.map((j) => ({ id: j.id, name: j.name }))}
          emailConfigured={emailConfigured}
        />
      </div>
    </div>
  );
}
