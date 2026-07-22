// Sends a real test form submission to CallRail using the org's saved config
// and surfaces the actual API response (or error) to the admin. This turns the
// otherwise-silent, best-effort forward into something you can debug: a bad key,
// a wrong account/company id, or a rejected field all show up here verbatim.

import { NextResponse } from "next/server";
import { auth, authEnabled } from "@/auth";
import { callRailConfig, callRailReady, forwardLeadToCallRail } from "@/modules/integrations/callrail";
import { getAdminOrg } from "@/server/currentOrg";
import { store } from "@/server/store";
import type { StoredLead } from "@/server/store";

async function guard() {
  if (authEnabled) {
    const session = await auth();
    if (!session?.user) return { error: NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 }) };
  }
  const org = await getAdminOrg();
  if (!org) return { error: NextResponse.json({ ok: false, error: "No business selected." }, { status: 400 }) };
  return { org };
}

export async function POST() {
  const g = await guard();
  if (g.error) return g.error;

  const cfg = callRailConfig(await store.getOrgSettings(g.org.id));
  if (!callRailReady(cfg)) {
    return NextResponse.json({
      ok: false,
      error: "CallRail isn't fully configured. Turn on the toggle and fill in Account ID, Company ID, and API key.",
    });
  }

  // A representative dummy lead so CallRail receives the same shape a real
  // completion would send.
  const now = new Date().toISOString();
  const lead = {
    id: "test",
    orgId: g.org.id,
    journeyId: "test",
    journeySlug: "test",
    outcome: "lead",
    qualified: true,
    referral: false,
    score: 0,
    answers: { description: "Test submission from Intake Engine settings." },
    context: {},
    displayName: "Intake Engine Test",
    email: "test@intakeengine.com",
    phone: "+15125550123",
    createdAt: now,
  } as unknown as StoredLead;

  const context = {
    pageUrl: `https://${g.org.slug}.intakeengine.com/`,
    landingPage: `https://${g.org.slug}.intakeengine.com/`,
    referrer: "",
    utm_source: "intake-engine-test",
  };

  try {
    await forwardLeadToCallRail(cfg, lead, context);
    return NextResponse.json({
      ok: true,
      message: "CallRail accepted a test form submission — check Leads → Form submissions in CallRail.",
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "CallRail rejected the test." });
  }
}
