// Search-indexing preference for public landing pages. Stored on the org
// settings blob under `seo.noindexLandings`. Default is ON (noindex) so ads
// landings don't compete with the firm's main site in Google. A journey can
// override via `definition.seo.noindex`.

import type { JourneyDefinition } from "@/modules/journeys/domain/schema";

export function readNoindexLandings(settings: Record<string, unknown> | undefined): boolean {
  const seo = settings?.seo;
  if (seo && typeof seo === "object" && "noindexLandings" in seo) {
    return (seo as { noindexLandings?: unknown }).noindexLandings !== false;
  }
  return true;
}

/** Journey override wins; otherwise the business default. */
export function landingIsNoindex(
  def: JourneyDefinition | undefined,
  orgNoindexLandings: boolean,
): boolean {
  const j = def?.seo?.noindex;
  if (j === true) return true;
  if (j === false) return false;
  return orgNoindexLandings;
}
