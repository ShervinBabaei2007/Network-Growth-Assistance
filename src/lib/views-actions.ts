"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { err, ok, type ActionResult } from "@/lib/action-result";
import { actionContext } from "@/lib/server/action-context";
import { isViewPage, MAX_VIEW_NAME, normalizeViewQuery } from "@/lib/views";
import { getT } from "@/lib/i18n/server";

/** Saved views for any list page (see lib/views.ts). A view is the page's filters as a URL search string. */

const viewName = z.string().trim().min(1, "Give the view a name.").max(MAX_VIEW_NAME, `Use ${MAX_VIEW_NAME} characters or fewer.`);

export async function saveView(page: string, name: string, search: string): Promise<ActionResult<{ id: string }>> {
  const t = await getT();
  if (!isViewPage(page)) return err(t("views.unknownPage"));
  const parsedName = viewName.safeParse(name);
  if (!parsedName.success) return err(parsedName.error.issues[0]?.message ?? t("views.nameNeeded"));
  const query = normalizeViewQuery(page, search);
  if (!query) return err(t("views.filterFirst"));
  const ctx = await actionContext();
  const { data, error } = await ctx.supabase.from("saved_views").insert({ page, name: parsedName.data, query }).select("id").single();
  if (error) {
    if (error.code === "23505") return err(t("views.duplicate"));
    if (error.code === "P0001") return err(t("views.limit"));
    return err(t("views.saveFailed"));
  }
  refresh();
  return ok(t("views.savedNamed", { name: parsedName.data }), { data: { id: data.id } });
}

export async function deleteView(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return err((await getT())("views.notFound"));
  const ctx = await actionContext();
  const { error, count } = await ctx.supabase.from("saved_views").delete({ count: "exact" }).eq("id", id);
  if (error || !count) return err((await getT())("views.deleteFailed"));
  refresh();
  return ok((await getT())("views.deleted"));
}
