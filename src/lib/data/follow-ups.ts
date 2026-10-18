import "server-only";
import { createClient } from "@/lib/supabase/server";

/** How many suggested follow-ups are due on or before `today` (YYYY-MM-DD in the user's time zone). Zero if it can't be read. */
export async function countDueFollowUps(today: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase.from("follow_ups").select("id", { count: "exact", head: true }).eq("state", "suggested").lte("due_on", today);
  return error ? 0 : (count ?? 0);
}
