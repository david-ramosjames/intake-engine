// Download a GTM container-import JSON tailored to the current business (its
// GTM container id, GA4 measurement id, and name). Import it into the firm's
// GTM container to create all the Consult Flow triggers + GA4 event tags.

import { NextResponse } from "next/server";
import { auth, authEnabled } from "@/auth";
import { buildGtmContainerImport } from "@/modules/integrations/gtmImport";
import { getAdminOrg } from "@/server/currentOrg";
import { store } from "@/server/store";

export async function GET() {
  if (authEnabled) {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const org = await getAdminOrg();
  if (!org) return NextResponse.json({ ok: false, error: "No business selected." }, { status: 400 });

  const settings = await store.getOrgSettings(org.id);
  const gtm = settings.gtm as { containerId?: string; ga4Id?: string } | undefined;
  const json = buildGtmContainerImport({
    firmName: org.name,
    gtmPublicId: gtm?.containerId,
    ga4Id: gtm?.ga4Id,
  });

  const filename = `gtm-${org.slug}-consult-events.json`;
  return new NextResponse(JSON.stringify(json, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
