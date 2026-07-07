// Read-through cache for the PUBLIC published-journey lookup, which is hit on
// every visitor page load / lead submission but changes only when an editor
// saves. Cached by a per-journey tag and revalidated on save (see the create/
// update paths), with a 5-minute safety TTL. Admin reads stay uncached so the
// editor always sees fresh data.

import { unstable_cache, revalidateTag } from "next/cache";
import { store } from "./store";
import type { StoredJourney } from "./store/types";

export function journeyTag(orgId: string, slug: string): string {
  return `journey:${orgId}:${slug}`;
}

export function getPublishedJourneyCached(orgId: string, slug: string): Promise<StoredJourney | null> {
  return unstable_cache(() => store.getJourney(orgId, slug), ["published-journey", orgId, slug], {
    tags: [journeyTag(orgId, slug)],
    revalidate: 300,
  })();
}

/** Invalidate the cached published journey after an edit/create. */
export function revalidateJourney(orgId: string, slug: string): void {
  revalidateTag(journeyTag(orgId, slug));
}
