import { FaqLibraryManager } from "@/components/admin/FaqLibraryManager";
import { readFaqSets } from "@/modules/faq/faqSets";
import { getAdminOrg } from "@/server/currentOrg";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

export default async function FaqLibraryPage() {
  const org = await getAdminOrg();
  if (!org) return <div className="px-8 py-10 text-gray-500">No business selected.</div>;

  const sets = readFaqSets(await store.getOrgSettings(org.id));

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-gray-900">FAQ library</h1>
      <p className="mt-1 text-sm text-gray-500">
        Build reusable sets of FAQs once, then pick a set from the dropdown on any journey (Design &amp; content → FAQs)
        instead of retyping them. Editing a set here updates every journey that uses it.
      </p>

      <div className="mt-6">
        <FaqLibraryManager initialSets={sets} />
      </div>
    </div>
  );
}
