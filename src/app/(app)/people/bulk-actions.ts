"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { err, ok, type ActionResult } from "@/lib/action-result";
import { cleanTag, groupBy, withoutTag, withTag } from "@/lib/bulk";
import { addDays, localDate } from "@/lib/dates";
import { MAX_SELECTION } from "@/lib/selection";
import { actionContext, logActivity } from "@/lib/server/action-context";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Bulk changes to saved people. Each action applies the same rule as the single-person one, returns what it
 * changed so Undo can put it back, and only undoes rows nothing else has touched since. Capped at 200 rows.
 * Everything runs under the user's own row-level security.
 */

type Status = Database["public"]["Enums"]["network_person_status"];
const STATUSES = ["discovered", "shortlisted", "ready_to_connect", "connection_sent_manually", "connected", "replied", "follow_up", "archived", "not_relevant"] as const;
const ids = z.array(z.uuid()).min(1, "Select at least one person.").max(MAX_SELECTION, `Select up to ${MAX_SELECTION} people at a time.`);

export type PersonStatusChange = { status: Status; changed: { id: string; previous: Status }[] };
export type PersonTagChange = { tag: string; changed: string[] };
export type PersonSnoozeChange = { until: string; changed: { id: string; previous: string | null }[] };

/** Sets a CRM status on many people ("mark sent" is `connection_sent_manually`). */
export async function bulkSetPersonStatus(rawIds: string[], status: string): Promise<ActionResult<PersonStatusChange>> {
  const parsedIds = ids.safeParse(rawIds);
  const parsedStatus = z.enum(STATUSES).safeParse(status);
  if (!parsedIds.success) return err(parsedIds.error.issues[0]?.message ?? "Select at least one person.");
  if (!parsedStatus.success) return err("Unknown status.");
  const ctx = await actionContext();

  const { data: rows, error } = await ctx.supabase.from("network_people").select("id, crm_status").in("id", parsedIds.data);
  if (error) return err("Couldn't update the people you selected. Try again.");
  const eligible = rows.filter((p) => p.crm_status !== parsedStatus.data);
  if (eligible.length === 0) return err("Everyone you selected already has that status.");

  const { error: updateError } = await ctx.supabase
    .from("network_people")
    .update({ crm_status: parsedStatus.data, saved: parsedStatus.data !== "not_relevant" ? true : undefined })
    .in("id", eligible.map((p) => p.id));
  if (updateError) return err("Couldn't update the people you selected. Try again.");

  const kind = parsedStatus.data === "connection_sent_manually" ? "marked_sent" : parsedStatus.data === "replied" ? "replied" : "status_change";
  await ctx.supabase.from("network_interactions").insert(eligible.map((p) => ({ user_id: ctx.userId, person_id: p.id, kind, body: parsedStatus.data })));
  // Same rule as the single-person action: "connected" is the user's own statement, so they count as a known connection.
  if (parsedStatus.data === "connected") {
    await ctx.supabase.from("network_people").update({ proximity: "connected", known_match_state: "confirmed_same" }).in("id", eligible.map((p) => p.id));
  }

  await logActivity(ctx, "network.bulk_status", { count: eligible.length, status: parsedStatus.data });
  refresh();
  const skipped = parsedIds.data.length - eligible.length;
  return ok(`${eligible.length} marked ${parsedStatus.data.replace(/_/g, " ")}${skipped ? `. ${skipped} already had it.` : "."}`, {
    data: { status: parsedStatus.data, changed: eligible.map((p) => ({ id: p.id, previous: p.crm_status })) },
  });
}

/** Puts people back to the status they had, but only where nothing has changed it since. */
export async function undoBulkPersonStatus(change: PersonStatusChange): Promise<ActionResult> {
  const parsed = z
    .object({ status: z.enum(STATUSES), changed: z.array(z.object({ id: z.uuid(), previous: z.enum(STATUSES) })).min(1).max(MAX_SELECTION) })
    .safeParse(change);
  if (!parsed.success) return err("Couldn't undo that.");
  const ctx = await actionContext();
  for (const [previous, group] of groupBy(parsed.data.changed, (c) => c.previous, (c) => c.id)) {
    const { error } = await ctx.supabase.from("network_people").update({ crm_status: previous }).in("id", group).eq("crm_status", parsed.data.status);
    if (error) return err("Couldn't undo that. Try again.");
  }
  refresh();
  return ok(`${parsed.data.changed.length} restored.`);
}

/** Adds one tag to many people (skipping anyone who has it or has hit the 20-tag limit). */
export async function bulkAddPersonTag(rawIds: string[], rawTag: string): Promise<ActionResult<PersonTagChange>> {
  const parsedIds = ids.safeParse(rawIds);
  if (!parsedIds.success) return err(parsedIds.error.issues[0]?.message ?? "Select at least one person.");
  const tag = cleanTag(rawTag);
  if (!tag || /[,]/.test(tag)) return err("Type one tag, without commas.");
  const ctx = await actionContext();

  const { data: rows, error } = await ctx.supabase.from("network_people").select("id, tags").in("id", parsedIds.data);
  if (error) return err("Couldn't tag the people you selected. Try again.");
  const changed: string[] = [];
  for (const p of rows) {
    const next = withTag(p.tags, tag);
    if (next === p.tags) continue;
    const { error: e } = await ctx.supabase.from("network_people").update({ tags: [...next] }).eq("id", p.id);
    if (e) return err("Couldn't tag everyone you selected. Try again.");
    changed.push(p.id);
  }
  if (changed.length === 0) return err("Everyone you selected already has that tag, or has the maximum number of tags.");
  await logActivity(ctx, "network.bulk_tag", { count: changed.length });
  refresh();
  const skipped = parsedIds.data.length - changed.length;
  return ok(`Tagged ${changed.length} “${tag}”${skipped ? `. ${skipped} skipped.` : "."}`, { data: { tag, changed } });
}

export async function undoBulkPersonTag(change: PersonTagChange): Promise<ActionResult> {
  const parsed = z.object({ tag: z.string().min(1).max(40), changed: z.array(z.uuid()).min(1).max(MAX_SELECTION) }).safeParse(change);
  if (!parsed.success) return err("Couldn't undo that.");
  const ctx = await actionContext();
  const { data: rows, error } = await ctx.supabase.from("network_people").select("id, tags").in("id", parsed.data.changed);
  if (error) return err("Couldn't undo that. Try again.");
  for (const p of rows) {
    const next = withoutTag(p.tags, parsed.data.tag);
    if (next === p.tags) continue;
    const { error: e } = await ctx.supabase.from("network_people").update({ tags: [...next] }).eq("id", p.id);
    if (e) return err("Couldn't undo that. Try again.");
  }
  refresh();
  return ok(`Removed “${parsed.data.tag}” from ${rows.length}.`);
}

/** Moves the reminder of many people to a later day (in the user's time zone). */
export async function bulkSnoozePeople(rawIds: string[], days: number): Promise<ActionResult<PersonSnoozeChange>> {
  const parsedIds = ids.safeParse(rawIds);
  const parsedDays = z.number().int().min(1).max(90).safeParse(days);
  if (!parsedIds.success) return err(parsedIds.error.issues[0]?.message ?? "Select at least one person.");
  if (!parsedDays.success) return err("Choose between 1 and 90 days.");
  const ctx = await actionContext();
  const until = addDays(localDate(new Date(), ctx.settings.timezone), parsedDays.data);

  const { data: rows, error } = await ctx.supabase.from("network_people").select("id, reminder_at").in("id", parsedIds.data);
  if (error) return err("Couldn't snooze the people you selected. Try again.");
  const { error: updateError } = await ctx.supabase.from("network_people").update({ reminder_at: until }).in("id", rows.map((p) => p.id));
  if (updateError) return err("Couldn't snooze the people you selected. Try again.");
  await logActivity(ctx, "network.bulk_snooze", { count: rows.length, days: parsedDays.data });
  refresh();
  return ok(`${rows.length} reminders moved to ${until}.`, { data: { until, changed: rows.map((p) => ({ id: p.id, previous: p.reminder_at })) } });
}

export async function undoBulkSnoozePeople(change: PersonSnoozeChange): Promise<ActionResult> {
  const parsed = z
    .object({ until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), changed: z.array(z.object({ id: z.uuid(), previous: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() })).min(1).max(MAX_SELECTION) })
    .safeParse(change);
  if (!parsed.success) return err("Couldn't undo that.");
  const ctx = await actionContext();
  for (const [previous, group] of groupBy(parsed.data.changed, (c) => c.previous, (c) => c.id)) {
    const { error } = await ctx.supabase.from("network_people").update({ reminder_at: previous }).in("id", group).eq("reminder_at", parsed.data.until);
    if (error) return err("Couldn't undo that. Try again.");
  }
  refresh();
  return ok(`${parsed.data.changed.length} reminders restored.`);
}

/** Removes people from the saved list and deletes them. The caller confirms first; there is no undo. */
export async function bulkDeletePeople(rawIds: string[]): Promise<ActionResult> {
  const parsed = ids.safeParse(rawIds);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Select at least one person.");
  const ctx = await actionContext();
  const { error, count } = await ctx.supabase.from("network_people").delete({ count: "exact" }).in("id", parsed.data);
  if (error) return err("Couldn't delete the people you selected. Try again.");
  await logActivity(ctx, "network.bulk_deleted", { count: count ?? 0 });
  refresh();
  return ok(`${count ?? 0} deleted.`);
}
