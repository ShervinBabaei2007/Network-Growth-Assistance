"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { cleanTag, withoutTag, withTag } from "@/lib/bulk";
import { addDays, localDate } from "@/lib/dates";
import { CONNECTED_PATCH, PERSON_STATUSES, savesPerson, statusInteractionKind, type PersonStatus } from "@/lib/people/crm";
import { MAX_SELECTION } from "@/lib/selection";
import { restoreByPrevious, selectedIds, withSkipped } from "@/lib/server/bulk-change";
import { done, fail, mutate } from "@/lib/server/mutation";

/**
 * Bulk changes to saved people. Each action applies the same rule as the single-person one, returns what it
 * changed so Undo can put it back, and only undoes rows nothing else has touched since. Capped at 200 rows.
 * Everything runs under the user's own row-level security.
 */

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export type PersonStatusChange = { status: PersonStatus; changed: { id: string; previous: PersonStatus }[] };
export type PersonTagChange = { tag: string; changed: string[] };
export type PersonSnoozeChange = { until: string; changed: { id: string; previous: string | null }[] };

/** Sets a CRM status on many people ("mark sent" is `connection_sent_manually`). */
export async function bulkSetPersonStatus(rawIds: string[], status: string): Promise<ActionResult<PersonStatusChange>> {
  return mutate<PersonStatusChange>({}, async ({ ctx }) => {
    const picked = selectedIds(rawIds, "people");
    if (!Array.isArray(picked)) return picked;
    const parsedStatus = z.enum(PERSON_STATUSES).safeParse(status);
    if (!parsedStatus.success) return fail("candidatesPage.bulkUnknownStatus");

    const { data: rows, error } = await ctx.supabase.from("network_people").select("id, crm_status").in("id", picked);
    if (error) return fail("candidatesPage.bulkUpdateFailed");
    const eligible = rows.filter((p) => p.crm_status !== parsedStatus.data);
    if (eligible.length === 0) return fail("peoplePage.alreadyStatus");
    const eligibleIds = eligible.map((p) => p.id);

    const { error: updateError } = await ctx.supabase.from("network_people").update({ crm_status: parsedStatus.data, saved: savesPerson(parsedStatus.data) }).in("id", eligibleIds);
    if (updateError) return fail("candidatesPage.bulkUpdateFailed");

    const kind = statusInteractionKind(parsedStatus.data);
    await ctx.supabase.from("network_interactions").insert(eligible.map((p) => ({ user_id: ctx.userId, person_id: p.id, kind, body: parsedStatus.data })));
    if (parsedStatus.data === "connected") await ctx.supabase.from("network_people").update(CONNECTED_PATCH).in("id", eligibleIds);

    const skipped = picked.length - eligible.length;
    return done((t) => withSkipped(t, t("peoplePage.bulkMarked", { count: eligible.length, label: t(`crmBulk.${parsedStatus.data}`) }), skipped, "peoplePage.bulkAlreadyHad"), {
      data: { status: parsedStatus.data, changed: eligible.map((p) => ({ id: p.id, previous: p.crm_status })) },
      log: ["network.bulk_status", { count: eligible.length, status: parsedStatus.data }],
    });
  });
}

/** Puts people back to the status they had, but only where nothing has changed it since. */
export async function undoBulkPersonStatus(change: PersonStatusChange): Promise<ActionResult> {
  return mutate({}, async ({ ctx }) => {
    const parsed = z.object({ status: z.enum(PERSON_STATUSES), changed: z.array(z.object({ id: z.uuid(), previous: z.enum(PERSON_STATUSES) })).min(1).max(MAX_SELECTION) }).safeParse(change);
    if (!parsed.success) return fail("candidatesPage.bulkUndoFailed");
    const restored = await restoreByPrevious(parsed.data.changed, (previous, ids) => ctx.supabase.from("network_people").update({ crm_status: previous }).in("id", ids).eq("crm_status", parsed.data.status));
    if (!restored) return fail("candidatesPage.bulkUndoRetry");
    return done("candidatesPage.bulkRestored", { params: { count: parsed.data.changed.length } });
  });
}

/** Adds one tag to many people (skipping anyone who has it or has hit the 20-tag limit). */
export async function bulkAddPersonTag(rawIds: string[], rawTag: string): Promise<ActionResult<PersonTagChange>> {
  return mutate<PersonTagChange>({}, async ({ ctx }) => {
    const picked = selectedIds(rawIds, "people");
    if (!Array.isArray(picked)) return picked;
    const tag = cleanTag(rawTag);
    if (!tag || /[,]/.test(tag)) return fail("peoplePage.tagOne");

    const { data: rows, error } = await ctx.supabase.from("network_people").select("id, tags").in("id", picked);
    if (error) return fail("peoplePage.tagFailed");
    const changed: string[] = [];
    for (const p of rows) {
      const next = withTag(p.tags, tag);
      if (next === p.tags) continue;
      const { error: e } = await ctx.supabase.from("network_people").update({ tags: [...next] }).eq("id", p.id);
      if (e) return fail("peoplePage.tagEveryoneFailed");
      changed.push(p.id);
    }
    if (changed.length === 0) return fail("peoplePage.tagNone");
    const skipped = picked.length - changed.length;
    return done((t) => withSkipped(t, t("peoplePage.tagged", { count: changed.length, tag }), skipped, "peoplePage.taggedSkipped"), { data: { tag, changed }, log: ["network.bulk_tag", { count: changed.length }] });
  });
}

export async function undoBulkPersonTag(change: PersonTagChange): Promise<ActionResult> {
  return mutate({}, async ({ ctx }) => {
    const parsed = z.object({ tag: z.string().min(1).max(40), changed: z.array(z.uuid()).min(1).max(MAX_SELECTION) }).safeParse(change);
    if (!parsed.success) return fail("candidatesPage.bulkUndoFailed");
    const { data: rows, error } = await ctx.supabase.from("network_people").select("id, tags").in("id", parsed.data.changed);
    if (error) return fail("candidatesPage.bulkUndoRetry");
    for (const p of rows) {
      const next = withoutTag(p.tags, parsed.data.tag);
      if (next === p.tags) continue;
      const { error: e } = await ctx.supabase.from("network_people").update({ tags: [...next] }).eq("id", p.id);
      if (e) return fail("candidatesPage.bulkUndoRetry");
    }
    return done("peoplePage.tagRemoved", { params: { tag: parsed.data.tag, count: rows.length } });
  });
}

/** Moves the reminder of many people to a later day (in the user's time zone). */
export async function bulkSnoozePeople(rawIds: string[], days: number): Promise<ActionResult<PersonSnoozeChange>> {
  return mutate<PersonSnoozeChange>({}, async ({ ctx }) => {
    const picked = selectedIds(rawIds, "people");
    if (!Array.isArray(picked)) return picked;
    const parsedDays = z.number().int().min(1).max(90).safeParse(days);
    if (!parsedDays.success) return fail("peoplePage.daysRange");
    const until = addDays(localDate(new Date(), ctx.settings.timezone), parsedDays.data);

    const { data: rows, error } = await ctx.supabase.from("network_people").select("id, reminder_at").in("id", picked);
    if (error) return fail("peoplePage.snoozeFailed");
    const { error: updateError } = await ctx.supabase.from("network_people").update({ reminder_at: until }).in("id", rows.map((p) => p.id));
    if (updateError) return fail("peoplePage.snoozeFailed");
    return done("peoplePage.remindersMoved", {
      params: { count: rows.length, until },
      data: { until, changed: rows.map((p) => ({ id: p.id, previous: p.reminder_at })) },
      log: ["network.bulk_snooze", { count: rows.length, days: parsedDays.data }],
    });
  });
}

export async function undoBulkSnoozePeople(change: PersonSnoozeChange): Promise<ActionResult> {
  return mutate({}, async ({ ctx }) => {
    const parsed = z.object({ until: date, changed: z.array(z.object({ id: z.uuid(), previous: date.nullable() })).min(1).max(MAX_SELECTION) }).safeParse(change);
    if (!parsed.success) return fail("candidatesPage.bulkUndoFailed");
    const restored = await restoreByPrevious(parsed.data.changed, (previous, ids) => ctx.supabase.from("network_people").update({ reminder_at: previous }).in("id", ids).eq("reminder_at", parsed.data.until));
    if (!restored) return fail("candidatesPage.bulkUndoRetry");
    return done("peoplePage.remindersRestored", { params: { count: parsed.data.changed.length } });
  });
}

/** Removes people from the saved list and deletes them. The caller confirms first; there is no undo. */
export async function bulkDeletePeople(rawIds: string[]): Promise<ActionResult> {
  return mutate({}, async ({ ctx }) => {
    const picked = selectedIds(rawIds, "people");
    if (!Array.isArray(picked)) return picked;
    const { error, count } = await ctx.supabase.from("network_people").delete({ count: "exact" }).in("id", picked);
    if (error) return fail("candidatesPage.bulkDeleteFailed");
    return done("candidatesPage.bulkDeleted", { params: { count: count ?? 0 }, log: ["network.bulk_deleted", { count: count ?? 0 }] });
  });
}
