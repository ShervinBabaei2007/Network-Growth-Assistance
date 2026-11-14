"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { shiftReminder } from "@/lib/applications/snooze";
import { STAGES, type Stage } from "@/lib/applications/stages";
import { MAX_SELECTION } from "@/lib/selection";
import { selectedIds, withSkipped } from "@/lib/server/bulk-change";
import { done, fail, mutate } from "@/lib/server/mutation";

/**
 * Moves many applications to one stage. Each row goes through set_application_stage with the version the page
 * loaded, so a row changed in another tab is skipped (and counted) rather than overwritten. The result carries
 * the new versions so Undo can move exactly those rows back, again with version checks.
 */

const item = z.object({ id: z.uuid(), version: z.number().int().min(0) });
const stage = z.enum(STAGES);

export type ApplicationsMove = { to: Stage; changed: { id: string; from: Stage; version: number }[]; skipped: number };

export async function bulkMoveStage(items: { id: string; version: number }[], to: Stage): Promise<ActionResult<ApplicationsMove>> {
  return mutate<ApplicationsMove>({}, async ({ ctx }) => {
    const picked = selectedIds(Array.isArray(items) ? items.map((i) => i?.id) : [], "applications");
    if (!Array.isArray(picked)) return picked;
    const parsed = z.array(item).safeParse(items);
    if (!parsed.success) return fail("applicationsPage.selectAtLeast");
    const target = stage.safeParse(to);
    if (!target.success) return fail("applicationsPage.unknownStage");

    const { data: rows, error } = await ctx.supabase.from("applications").select("id, stage").in("id", picked);
    if (error) return fail("applicationsPage.moveFailed");
    const before = new Map(rows.map((r) => [r.id, r.stage as Stage]));

    const changed: ApplicationsMove["changed"] = [];
    let skipped = 0;
    for (const { id, version } of parsed.data) {
      const from = before.get(id);
      if (!from || from === target.data) {
        skipped++;
        continue;
      }
      const { data: next, error: moveError } = await ctx.supabase.rpc("set_application_stage", { p_id: id, p_stage: target.data, p_expected_version: version });
      if (moveError || next === null) {
        skipped++; // stale version, or another attempt at the job is open
        continue;
      }
      changed.push({ id, from, version: next });
    }
    if (changed.length === 0) return fail("applicationsPage.noneMoved");

    return done((t) => withSkipped(t, t("applicationsPage.movedTo", { count: changed.length, stage: t(`stage.${target.data}`) }), skipped, "applicationsPage.movedSkipped"), {
      data: { to: target.data, changed, skipped },
      log: ["applications.bulk_stage", { count: changed.length, to: target.data }],
    });
  });
}

/** Moves the same rows back to the stage they were in, skipping any that changed since. */
export async function undoBulkMoveStage(move: ApplicationsMove): Promise<ActionResult> {
  return mutate({}, async ({ ctx }) => {
    const parsed = z
      .object({ to: stage, changed: z.array(z.object({ id: z.uuid(), from: stage, version: z.number().int().min(0) })).min(1).max(MAX_SELECTION), skipped: z.number() })
      .safeParse(move);
    if (!parsed.success) return fail("applicationsPage.undoFailed");
    let restored = 0;
    for (const c of parsed.data.changed) {
      const { data: next, error } = await ctx.supabase.rpc("set_application_stage", { p_id: c.id, p_stage: c.from, p_expected_version: c.version });
      if (!error && next !== null) restored++;
    }
    if (restored === 0) return fail("applicationsPage.undoChanged", { refresh: true });
    const left = parsed.data.changed.length - restored;
    return done((t) => `${t("applicationsPage.movedBack", { count: restored })}${left ? t("applicationsPage.movedBackLeft", { count: left }) : "."}`);
  });
}

// ---------------------------------------------------------------- snooze reminders

export type ReminderSnooze = { days: number; applications: number; changed: { id: string; previous: string; next: string }[] };

/**
 * Moves every open reminder on the selected applications later by whole days, keeping each one's time of day in the
 * person's own time zone. Applications themselves are not changed. Returns what moved so Undo can put it back.
 */
export async function bulkSnoozeReminders(rawIds: string[], days: number): Promise<ActionResult<ReminderSnooze>> {
  return mutate<ReminderSnooze>({}, async ({ ctx }) => {
    const picked = selectedIds(rawIds, "applications");
    if (!Array.isArray(picked)) return picked;
    const parsedDays = z.number().int().min(1).max(90).safeParse(days);
    if (!parsedDays.success) return fail("applicationsPage.daysRange");

    const { data: rows, error } = await ctx.supabase.from("application_reminders").select("id, application_id, due_at").in("application_id", picked).is("done_at", null).limit(1000);
    if (error) return fail("applicationsPage.snoozeFailed");
    if (rows.length === 0) return fail("applicationsPage.noReminders");

    const changed = rows.map((r) => ({ id: r.id, previous: r.due_at, next: shiftReminder(r.due_at, parsedDays.data, ctx.settings.timezone).toISOString() }));
    for (let i = 0; i < changed.length; i += 25) {
      const results = await Promise.all(changed.slice(i, i + 25).map((c) => ctx.supabase.from("application_reminders").update({ due_at: c.next }).eq("id", c.id).eq("due_at", c.previous)));
      if (results.some((r) => r.error)) return fail("applicationsPage.snoozeEvery");
    }
    const applications = new Set(rows.map((r) => r.application_id)).size;
    return done(
      (t) => {
        const reminders = changed.length === 1 ? t("applicationsPage.reminderWord1") : t("applicationsPage.reminderWordN", { count: changed.length });
        const apps = applications === 1 ? t("applicationsPage.applicationWord1") : t("applicationsPage.applicationWordN", { count: applications });
        return t("applicationsPage.snoozedMany", { reminders, applications: apps, days: parsedDays.data });
      },
      { data: { days: parsedDays.data, applications, changed }, log: ["applications.bulk_snooze", { reminders: changed.length, applications, days: parsedDays.data }] },
    );
  });
}

/** Puts the reminders back where they were, but only the ones nobody has moved or finished since. */
export async function undoBulkSnoozeReminders(snooze: ReminderSnooze): Promise<ActionResult> {
  return mutate({}, async ({ ctx }) => {
    const parsed = z
      .object({ days: z.number(), applications: z.number(), changed: z.array(z.object({ id: z.uuid(), previous: z.string(), next: z.string() })).min(1).max(1000) })
      .safeParse(snooze);
    if (!parsed.success) return fail("applicationsPage.undoFailed");
    let restored = 0;
    for (let i = 0; i < parsed.data.changed.length; i += 25) {
      const results = await Promise.all(
        parsed.data.changed.slice(i, i + 25).map((c) => ctx.supabase.from("application_reminders").update({ due_at: c.previous }).eq("id", c.id).eq("due_at", c.next).is("done_at", null).select("id")),
      );
      for (const r of results) if (!r.error && r.data.length) restored++;
    }
    if (restored === 0) return fail("applicationsPage.snoozeUndoFailed", { refresh: true });
    return done(restored === 1 ? "applicationsPage.remindersBackOne" : "applicationsPage.remindersBackMany", { params: { count: restored } });
  });
}
