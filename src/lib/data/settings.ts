import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";

export type SettingsRow = Tables<"settings">;

/**
 * The signed-in user's settings row, read once per request. The app shell (banner, appearance,
 * onboarding) and the page itself all need pieces of it, so they share this one read instead of each
 * making a round trip. `row` is null when the user has no row yet; `error` is set when it couldn't be read.
 * RLS limits the read to the user's own row.
 */
export const getSettings = cache(async (): Promise<{ row: SettingsRow | null; error: string | null }> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("settings").select("*").maybeSingle();
  return { row: data, error: error?.message ?? null };
});

/** The signed-in user's verified token claims, read once per request. Null when signed out. */
export const getClaims = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims ?? null;
});
