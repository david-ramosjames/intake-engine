"use server";

// Server Actions backing the admin. All writes go through the store, so they
// work identically in DEMO mode (file-backed) and with Postgres.

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth, authEnabled } from "@/auth";
import { getTemplate } from "@/modules/journeys/content/templates";
import { ADMIN_ORG_COOKIE, getAdminOrg } from "@/server/currentOrg";
import { revalidateJourney } from "@/server/journeyCache";
import { store } from "@/server/store";
import { slugify } from "@/server/store/types";

async function requireUser() {
  if (!authEnabled) return;
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized.");
}

export async function createOrganization(formData: FormData) {
  await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const industry = String(formData.get("industry") ?? "").trim() || undefined;
  const slug = slugify(String(formData.get("slug") ?? "") || name);
  if (!name || !slug) throw new Error("Name is required.");

  const org = await store.createOrganization({ name, slug, industry });

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_ORG_COOKIE, org.id, { path: "/", httpOnly: false, sameSite: "lax" });

  revalidatePath("/admin", "layout");
  redirect("/admin");
}

export async function selectOrganization(formData: FormData) {
  const orgId = String(formData.get("orgId") ?? "");
  if (orgId) {
    const cookieStore = await cookies();
    cookieStore.set(ADMIN_ORG_COOKIE, orgId, { path: "/", httpOnly: false, sameSite: "lax" });
  }
  revalidatePath("/admin", "layout");
  redirect("/admin");
}

export async function duplicateJourney(formData: FormData) {
  await requireUser();
  const org = await getAdminOrg();
  if (!org) throw new Error("No organization selected.");
  const slug = String(formData.get("slug") ?? "");
  const copy = await store.duplicateJourney(org.id, slug);
  revalidateJourney(org.id, copy.slug);
  revalidatePath("/admin/journeys");
  redirect(`/admin/journeys/${copy.slug}/edit`);
}

export async function deleteJourney(formData: FormData) {
  await requireUser();
  const org = await getAdminOrg();
  if (!org) throw new Error("No organization selected.");
  const slug = String(formData.get("slug") ?? "");
  if (slug) {
    await store.deleteJourney(org.id, slug);
    revalidateJourney(org.id, slug);
  }
  revalidatePath("/admin/journeys");
  redirect("/admin/journeys");
}

export async function deleteLead(formData: FormData) {
  await requireUser();
  const org = await getAdminOrg();
  if (!org) throw new Error("No organization selected.");
  const id = String(formData.get("id") ?? "");
  if (id) await store.deleteLead(org.id, id);
  revalidatePath("/admin/leads");
  redirect("/admin/leads");
}

export async function createJourney(formData: FormData) {
  await requireUser();
  const org = await getAdminOrg();
  if (!org) throw new Error("No organization selected.");

  const name = String(formData.get("name") ?? "").trim();
  const templateKey = String(formData.get("template") ?? "blank");
  const slug = slugify(String(formData.get("slug") ?? "") || name);
  if (!name || !slug) throw new Error("Journey name is required.");

  const template = getTemplate(templateKey);
  if (!template) throw new Error("Unknown template.");

  // Clone the template definition and stamp in the chosen name.
  const definition = { ...template.definition, name };

  await store.createJourney(org.id, { name, slug, description: template.description, definition });

  revalidateJourney(org.id, slug);
  revalidatePath("/admin/journeys");
  redirect("/admin/journeys");
}
