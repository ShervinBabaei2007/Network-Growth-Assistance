"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { err, ok, type ActionResult } from "@/lib/action-result";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

/**
 * Remembers the chosen language in a cookie (so signed-out pages use it too) and, for a signed-in person, in their
 * settings so it follows them to other devices. The value is checked against the supported list.
 */
export async function setLocale(locale: string): Promise<ActionResult> {
  if (!isLocale(locale)) return err("Unknown language.");
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (data?.claims.sub) await supabase.from("settings").update({ locale }).eq("user_id", data.claims.sub);
  } catch {
    // The cookie is enough; syncing to the account is a convenience.
  }
  refresh();
  return ok();
}
