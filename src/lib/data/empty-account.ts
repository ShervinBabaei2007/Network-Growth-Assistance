import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "./settings";

/**
 * True when "Load example data" would be accepted: the same test as the seed_sample_data function (no candidates,
 * schools, programs, applications or targets, and example data not already on). Read once per request.
 */
export const isEmptyAccount = cache(async (): Promise<boolean> => {
  const { row } = await getSettings();
  if (!row || row.sample_data || row.overall_target !== null || row.baseline_connections !== null) return false;
  const supabase = await createClient();
  const counts = await Promise.all(
    (["candidates", "universities", "disciplines", "applications"] as const).map((t) => supabase.from(t).select("id", { count: "exact", head: true })),
  );
  return counts.every((c) => !c.error && (c.count ?? 0) === 0);
});
