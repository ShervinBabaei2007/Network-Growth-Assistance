import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Per-user limits on actions that cost the server time or third-party calls. Counted in
 * the database (hit_rate_limit) for the signed-in user only, so the limit holds across
 * server instances and can't be spent on someone else's behalf.
 */
export const LIMITS = {
  crawlNow: { bucket: "jobs.crawl_now", max: 6, windowSeconds: 3600, message: "You've refreshed the boards several times this hour. They're also read automatically every 10 minutes." },
  newCountry: { bucket: "jobs.new_country", max: 3, windowSeconds: 86400, message: "You've started searches in several new countries today. Try that country again tomorrow." },
  checkFit: { bucket: "jobs.check_fit", max: 60, windowSeconds: 3600, message: "That's a lot of fit checks for one hour. Try again a little later." },
  resumeUpload: { bucket: "jobs.resume_upload", max: 20, windowSeconds: 86400, message: "You've uploaded 20 resumes today. Try again tomorrow." },
  export: { bucket: "account.export", max: 10, windowSeconds: 3600, message: "You've exported your data several times this hour. Try again later." },
  saveSearch: { bucket: "alerts.save_search", max: 30, windowSeconds: 86400, message: "You've saved or changed many searches today. Try again tomorrow." },
} as const;

export type Limit = (typeof LIMITS)[keyof typeof LIMITS];

/** True when the action may go ahead (and is counted). Fails closed if the check itself fails. */
export async function allow(supabase: SupabaseClient<Database>, limit: Limit): Promise<boolean> {
  const { data, error } = await supabase.rpc("hit_rate_limit", { p_bucket: limit.bucket, p_max: limit.max, p_window_seconds: limit.windowSeconds });
  return !error && data === true;
}
