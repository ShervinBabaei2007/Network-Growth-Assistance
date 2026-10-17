import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toCatalog, type Catalog } from "@/lib/domain";
import type { Database } from "@/lib/supabase/database.types";

/**
 * The user's own schools and disciplines. With the user's client, row-level security
 * limits this to them; with the server's client, pass their id.
 */
export async function loadCatalog(db: SupabaseClient<Database>, userId?: string): Promise<Catalog> {
  let u = db.from("universities").select("id, name, aliases, has_targets, position");
  let d = db.from("disciplines").select("id, name, aliases, position");
  if (userId) {
    u = u.eq("user_id", userId);
    d = d.eq("user_id", userId);
  }
  const [universities, disciplines] = await Promise.all([u, d]);
  if (universities.error) throw universities.error;
  if (disciplines.error) throw disciplines.error;
  return toCatalog(universities.data, disciplines.data);
}
