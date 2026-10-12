"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { err, ok, type ActionResult } from "@/lib/action-result";
import { establishBaseline } from "@/lib/alerts/run";
import { nextRunAt } from "@/lib/alerts/schedule";
import { emailConfigured } from "@/lib/email/mailer";
import { FeedQuery, FEED_QUERY_VERSION, searchOnly } from "@/lib/job-postings/feed-query";
import { failed, saved, type FormState } from "@/lib/form-state";
import { actionContext, logActivity } from "@/lib/server/action-context";
import { allow, LIMITS } from "@/lib/server/rate-limit";
import type { Json } from "@/lib/supabase/database.types";

/**
 * Saved searches and their alerts, and the notification centre. A new or changed search
 * starts from a baseline: what it shows now is never announced, only what arrives later.
 */

const uuid = z.uuid();
const Alert = z.object({
  name: z.string().trim().min(1, "Give the search a name.").max(120, "Keep the name under 120 characters."),
  frequency: z.enum(["off", "daily", "weekly"]),
  weekday: z.coerce.number().int().min(0).max(6),
  hour: z.coerce.number().int().min(0).max(23),
  emailDigest: z.boolean(),
});
export type AlertInput = z.input<typeof Alert>;

const settingsRow = (ctx: Awaited<ReturnType<typeof actionContext>>) =>
  ctx.supabase.from("settings").select("timezone, job_titles, job_country, job_provinces, job_seniority, job_exclude_keywords").eq("user_id", ctx.userId).single();

/** Saves the search the Jobs page is showing (`params` are its URL's search params). */
export async function saveSearch(params: Record<string, string>, input: AlertInput): Promise<ActionResult<{ id: string }>> {
  const query = FeedQuery.safeParse({ v: FEED_QUERY_VERSION, params });
  const alert = Alert.safeParse(input);
  if (!query.success) return err("This search can't be saved. Try searching again first.");
  if (!alert.success) return err(alert.error.issues[0]?.message ?? "Check the alert settings.");
  const ctx = await actionContext();
  if (!(await allow(ctx.supabase, LIMITS.saveSearch))) return err(LIMITS.saveSearch.message);
  const { data: s } = await settingsRow(ctx);
  if (!s) return err("Couldn't load your settings. Try again.");
  const a = alert.data;
  const now = new Date();
  const q = searchOnly(query.data);
  const { data, error } = await ctx.supabase
    .from("saved_searches")
    .insert({
      name: a.name,
      query: q as unknown as NonNullable<Json>,
      query_version: q.v,
      alert_frequency: a.frequency,
      alert_weekday: a.weekday,
      alert_hour: a.hour,
      email_digest: a.emailDigest && emailConfigured(),
      baseline_at: now.toISOString(),
      next_run_at: nextRunAt(a.frequency, a.weekday, a.hour, s.timezone, now)?.toISOString() ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return err(error?.code === "23514" ? "You can keep 20 saved searches. Delete one first." : "Couldn't save the search. Try again.");
  const base = await establishBaseline(ctx.supabase, ctx.userId, data.id, q, now.getTime());
  await logActivity(ctx, "alerts.search_saved", { search: data.id, frequency: a.frequency });
  refresh();
  if (!base.ok) return ok("Search saved. Its starting point couldn't be recorded, so the first alert may include jobs you've already seen.", { data: { id: data.id } });
  return ok(a.frequency === "off" ? "Search saved." : `Search saved. You'll be told about new matching jobs ${a.frequency === "daily" ? "daily" : "weekly"}; the ${base.count} shown now won't be announced.`, { data: { id: data.id } });
}

/** Changes a search's name or alert schedule. Doesn't reset what it has already shown. */
export async function updateSearch(id: string, input: AlertInput): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return err("Unknown search.");
  const alert = Alert.safeParse(input);
  if (!alert.success) return err(alert.error.issues[0]?.message ?? "Check the alert settings.");
  const ctx = await actionContext();
  const { data: s } = await settingsRow(ctx);
  const a = alert.data;
  const { error, count } = await ctx.supabase
    .from("saved_searches")
    .update(
      {
        name: a.name,
        alert_frequency: a.frequency,
        alert_weekday: a.weekday,
        alert_hour: a.hour,
        email_digest: a.emailDigest && emailConfigured(),
        next_run_at: nextRunAt(a.frequency, a.weekday, a.hour, s?.timezone ?? "UTC", new Date())?.toISOString() ?? null,
      },
      { count: "exact" },
    )
    .eq("id", id);
  if (error || !count) return err("Couldn't save. Try again.");
  refresh();
  return ok("Saved.");
}

/** Deletes a search and what it has seen. Undo restores it from a fresh starting point. */
export async function deleteSearch(id: string): Promise<ActionResult<{ snapshot: unknown }>> {
  if (!uuid.safeParse(id).success) return err("Unknown search.");
  const ctx = await actionContext();
  const { data: row } = await ctx.supabase.from("saved_searches").select("id, name, query, alert_frequency, alert_weekday, alert_hour, email_digest").eq("id", id).maybeSingle();
  if (!row) return err("That search wasn't found.");
  const { error } = await ctx.supabase.from("saved_searches").delete().eq("id", id);
  if (error) return err("Couldn't delete it. Try again.");
  refresh();
  return ok("Search deleted.", { data: { snapshot: row } });
}

export async function restoreSearch(snapshot: unknown): Promise<ActionResult> {
  const s = z.object({ name: z.string(), query: FeedQuery, alert_frequency: z.enum(["off", "daily", "weekly"]), alert_weekday: z.number(), alert_hour: z.number(), email_digest: z.boolean() }).safeParse(snapshot);
  if (!s.success) return err("Couldn't restore it.");
  const r = await saveSearch(s.data.query.params as Record<string, string>, { name: s.data.name, frequency: s.data.alert_frequency, weekday: s.data.alert_weekday, hour: s.data.alert_hour, emailDigest: s.data.email_digest });
  return r.ok ? ok("Search restored.") : err(r.error);
}

// ------------------------------------------------------------ notifications

export async function setNotificationRead(id: string, read: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return err("Unknown notification.");
  const ctx = await actionContext();
  const { error } = await ctx.supabase.from("notifications").update({ read_at: read ? new Date().toISOString() : null }).eq("id", id);
  if (error) return err("Couldn't update it. Try again.");
  refresh();
  return ok(read ? "Marked as read." : "Marked as unread.");
}

export async function markAllRead(): Promise<ActionResult<{ ids: string[] }>> {
  const ctx = await actionContext();
  const { data, error } = await ctx.supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null).select("id");
  if (error) return err("Couldn't update them. Try again.");
  refresh();
  return ok(data.length ? `Marked ${data.length} as read.` : "Nothing unread.", { data: { ids: data.map((d) => d.id) } });
}

/** Undo for "mark all read". */
export async function markUnread(ids: string[]): Promise<ActionResult> {
  const valid = ids.filter((i) => uuid.safeParse(i).success).slice(0, 500);
  const ctx = await actionContext();
  const { error } = await ctx.supabase.from("notifications").update({ read_at: null }).in("id", valid);
  if (error) return err("Couldn't undo. Try again.");
  refresh();
  return ok("Marked as unread again.");
}

const NotificationSettings = z.object({
  notifyReminders: z.literal("on").optional(),
  notifyInterviews: z.literal("on").optional(),
  weeklySummary: z.literal("on").optional(),
  emailNotifications: z.literal("on").optional(),
});

export async function updateNotificationSettings(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = NotificationSettings.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed("Couldn't read the form. Try again.");
  const ctx = await actionContext();
  const { error } = await ctx.supabase
    .from("settings")
    .update({
      notify_reminders: Boolean(parsed.data.notifyReminders),
      notify_interviews: Boolean(parsed.data.notifyInterviews),
      weekly_summary: Boolean(parsed.data.weeklySummary),
      email_notifications: Boolean(parsed.data.emailNotifications) && emailConfigured(),
    })
    .eq("user_id", ctx.userId);
  if (error) return failed("Couldn't save. Try again.");
  refresh();
  return saved("Notification settings saved.");
}
