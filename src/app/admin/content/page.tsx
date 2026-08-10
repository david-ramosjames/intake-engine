import { ContentLibraryManager } from "@/components/admin/ContentLibraryManager";
import { readContentBlocks } from "@/modules/content/contentBlocks";
import { getAdminOrg } from "@/server/currentOrg";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

export default async function ContentLibraryPage() {
  const org = await getAdminOrg();
  if (!org) return <div className="px-8 py-10 text-gray-500">No business selected.</div>;

  const blocks = readContentBlocks(await store.getOrgSettings(org.id));

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-gray-900">Content blocks</h1>
      <p className="mt-1 text-sm text-gray-500">
        Reusable paragraph sections (a heading + body copy) for the bottom of a landing page — like the FAQ and reviews
        blocks, but just prose. Build one here, then pick it from the dropdown on any journey. Editing a block updates
        every journey that uses it.
      </p>

      <div className="mt-6">
        <ContentLibraryManager initialBlocks={blocks} />
      </div>
    </div>
  );
}
