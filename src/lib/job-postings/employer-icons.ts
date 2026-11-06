import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { safeFetch } from "@/lib/net/safe-fetch";

const MAX_ICON_BYTES = 32 * 1024;
const RECHECK_DAYS = 30;

export type IconType = "image/png" | "image/x-icon" | "image/jpeg" | "image/gif" | "image/webp";

/**
 * What the bytes really are, from their first few bytes. The server's Content-Type is not trusted: an icon we store
 * and serve from our own origin must be one of these image formats (never SVG or HTML, which can carry script).
 */
export function sniffIcon(b: Uint8Array): IconType | null {
  const at = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x);
  if (b.length < 12) return null;
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0x00, 0x00, 0x01, 0x00)) return "image/x-icon";
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}

/** The address an icon is fetched from: always the confirmed website's own /favicon.ico. */
export const iconUrlFor = (website: string) => `${new URL(website).origin}/favicon.ico`;

type Admin = SupabaseClient<Database>;

/**
 * Fetches the icons of employers that have a confirmed website and have not been checked in the last 30 days.
 * A miss (no icon, wrong format, unreachable) is recorded too, so a dead site is retried monthly, not every run.
 */
export async function refreshEmployerIcons(admin: Admin, opts: { deadline: number; limit?: number }): Promise<{ checked: number; stored: number }> {
  const stale = new Date(Date.now() - RECHECK_DAYS * 86_400_000).toISOString();
  const { data: due } = await admin
    .from("employers")
    .select("id, website")
    .not("website", "is", null)
    .or(`icon_checked_at.is.null,icon_checked_at.lt.${stale}`)
    .order("icon_checked_at", { ascending: true, nullsFirst: true })
    .limit(opts.limit ?? 10);
  let checked = 0;
  let stored = 0;
  for (const e of due ?? []) {
    if (Date.now() > opts.deadline) break;
    checked++;
    let icon: { type: IconType; bytes: Uint8Array } | null = null;
    try {
      const res = await safeFetch(iconUrlFor(e.website!), { maxBytes: MAX_ICON_BYTES + 1, timeoutMs: 5000, headers: { Accept: "image/*" } });
      const type = res.status === 200 && res.bytes && res.bytes.length <= MAX_ICON_BYTES ? sniffIcon(res.bytes) : null;
      if (type) icon = { type, bytes: res.bytes! };
    } catch {
      // Unreachable or unsafe: treated as "no icon" until the next monthly check.
    }
    if (icon) {
      const { error } = await admin.from("employer_icons").upsert({ employer_id: e.id, content_type: icon.type, bytes: "\\x" + Buffer.from(icon.bytes).toString("hex"), fetched_at: new Date().toISOString() });
      if (!error) stored++;
    } else {
      await admin.from("employer_icons").delete().eq("employer_id", e.id);
    }
    await admin.from("employers").update({ has_icon: Boolean(icon), icon_checked_at: new Date().toISOString() }).eq("id", e.id);
  }
  return { checked, stored };
}
