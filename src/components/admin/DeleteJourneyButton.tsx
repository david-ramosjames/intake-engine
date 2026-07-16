"use client";

// Destructive delete for a journey. Confirms first — deleting a journey also
// removes any leads it captured, so this can't be undone.

import { deleteJourney } from "@/app/admin/actions";

export function DeleteJourneyButton({ slug, name }: { slug: string; name: string }) {
  return (
    <form
      action={deleteJourney}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `Delete “${name}”?\n\nThis permanently removes the journey and any leads it captured. This can’t be undone.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="slug" value={slug} />
      <button
        type="submit"
        className="rounded-full border border-red-200 px-4 py-2 text-sm text-red-600 transition hover:bg-red-50"
      >
        Delete
      </button>
    </form>
  );
}
