import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SavedView } from "@/components/views-menu";
import type { Database } from "@/lib/supabase/database.types";
import type { ViewPage } from "@/lib/views";

/** The signed-in user's saved views for a list, oldest first. A failed read shows as no saved views. */
export async function loadSavedViews(db: SupabaseClient<Database>, page: ViewPage): Promise<SavedView[]> {
  const { data } = await db.from("saved_views").select("id, name, query").eq("page", page).order("created_at");
  return data ?? [];
}
