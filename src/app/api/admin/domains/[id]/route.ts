// Admin endpoint to disconnect a custom domain from the current org.

import { NextResponse } from "next/server";
import { auth, authEnabled } from "@/auth";
import { getAdminOrg } from "@/server/currentOrg";
import { store } from "@/server/store";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (authEnabled) {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const org = await getAdminOrg();
  if (!org) return NextResponse.json({ ok: false, error: "No business selected." }, { status: 400 });

  await store.deleteDomain(org.id, id);
  return NextResponse.json({ ok: true });
}
