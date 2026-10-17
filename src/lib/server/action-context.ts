import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

/** The signed-in user's client, id and the settings most actions need. */
export async function actionContext() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) throw new Error("Not signed in");
  const { data: settings, error } = await supabase
    .from("settings")
    .select("timezone, project_start_date, paused, auto_approve")
    .single();
  if (error) throw error;
  return { supabase, userId, settings };
}

export type ActionContext = Awaited<ReturnType<typeof actionContext>>;

/**
 * Appends to the activity log. Payloads hold IDs and counts only, never names or
 * profile text. Failures are ignored so logging never blocks the user's change.
 */
export async function logActivity(
  ctx: Pick<ActionContext, "supabase" | "userId">,
  kind: string,
  payload: { [key: string]: Json | undefined } = {},
) {
  await ctx.supabase.from("activity_logs").insert({ user_id: ctx.userId, kind, payload });
}
