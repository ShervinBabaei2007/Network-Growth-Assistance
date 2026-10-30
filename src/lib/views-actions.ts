"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { err, ok, type ActionResult } from "@/lib/action-result";
import { actionContext } from "@/lib/server/action-context";
import { isViewPage, MAX_VIEW_NAME, normalizeViewQuery } from "@/lib/views";

/** Saved views for any list page (see lib/views.ts). A view is the page's filters as a URL search string. */

const viewName = z.string().trim().min(1, "Give the view a name.").max(MAX_VIEW_NAME, `Use ${MAX_VIEW_NAME} characters or fewer.`);

export async function saveView(page: string, name: string, search: string): Promise<ActionResult<{ id: string }>> {
  if (!isViewPage(page)) return err("Unknown page.");
  const parsedName = viewName.safeParse(name);
  if (!parsedName.success) return err(parsedName.error.issues[0]?.message ?? "Give the view a name.");
  const query = normalizeViewQuery(page, search);
  if (!query) return err("Choose at least one filter first, then save the view.");
  const ctx = await actionContext();
  const { data, error } = await ctx.supabase.from("saved_views").insert({ page, name: parsedName.data, query }).select("id").single();
  if (error) {
    if (error.code === "23505") return err("You already have a view with that name.");
    if (error.code === "P0001") return err("You can keep up to 30 saved views. Delete one first.");
    return err("Couldn't save the view. Try again.");
  }
  refresh();
  return ok(`Saved “${parsedName.data}”.`, { data: { id: data.id } });
}

export async function deleteView(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return err("Unknown view.");
  const ctx = await actionContext();
  const { error, count } = await ctx.supabase.from("saved_views").delete({ count: "exact" }).eq("id", id);
  if (error || !count) return err("Couldn't delete the view. Try again.");
  refresh();
  return ok("View deleted.");
}
