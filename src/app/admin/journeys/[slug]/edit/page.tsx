import { notFound } from "next/navigation";
import { JourneyEditor } from "@/components/admin/JourneyEditor";
import { getAdminOrg } from "@/server/currentOrg";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

export default async function EditJourney({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await getAdminOrg();
  if (!org) notFound();

  const journey = await store.getJourney(org.id, slug);
  if (!journey) notFound();

  return <JourneyEditor slug={journey.slug} orgSlug={org.slug} initial={journey.definition} />;
}
