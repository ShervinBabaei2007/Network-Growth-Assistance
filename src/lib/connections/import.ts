import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { planConnectionImport, type ConnectionImportPlan, type ExistingConnection, type KnownConnectionInput } from "./csv";

type Db = SupabaseClient<Database>;
type Source = Database["public"]["Enums"]["known_connection_source"];

export async function loadExistingConnections(db: Db): Promise<ExistingConnection[]> {
  const out: ExistingConnection[] = [];
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await db
      .from("known_connections")
      .select("id, linkedin_key, normalized_name, company, position, connected_on")
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    out.push(...data.map((r) => ({ id: r.id, linkedinKey: r.linkedin_key, normalizedName: r.normalized_name, company: r.company, position: r.position, connectedOn: r.connected_on })));
    if (data.length < 1000) break;
  }
  return out;
}

export async function planImport(db: Db, rows: KnownConnectionInput[]): Promise<ConnectionImportPlan> {
  return planConnectionImport(rows, await loadExistingConnections(db));
}

/** Writes an import plan. Returns how many writes failed (re-running is safe). */
export async function applyConnectionImport(db: Db, userId: string, plan: ConnectionImportPlan, source: Source): Promise<number> {
  let failures = 0;
  for (let i = 0; i < plan.insert.length; i += 500) {
    const chunk = plan.insert.slice(i, i + 500).map((r) => ({
      user_id: userId,
      full_name: r.fullName,
      first_name: r.firstName?.slice(0, 100) ?? null,
      last_name: r.lastName?.slice(0, 100) ?? null,
      normalized_name: r.normalizedName,
      company: r.company,
      position: r.position,
      linkedin_url: r.linkedinUrl,
      linkedin_key: r.linkedinKey,
      connected_on: r.connectedOn,
      source,
    }));
    const { error } = await db.from("known_connections").insert(chunk);
    if (error) failures += chunk.length;
  }
  for (let i = 0; i < plan.update.length; i += 20) {
    const results = await Promise.all(
      plan.update.slice(i, i + 20).map(({ id, changes }) =>
        db
          .from("known_connections")
          .update({
            ...(changes.company !== undefined ? { company: changes.company } : {}),
            ...(changes.position !== undefined ? { position: changes.position } : {}),
            ...(changes.linkedinKey !== undefined ? { linkedin_key: changes.linkedinKey, linkedin_url: changes.linkedinUrl ?? null } : {}),
            ...(changes.connectedOn !== undefined ? { connected_on: changes.connectedOn } : {}),
          })
          .eq("id", id),
      ),
    );
    failures += results.filter((r) => r.error).length;
  }
  return failures;
}
