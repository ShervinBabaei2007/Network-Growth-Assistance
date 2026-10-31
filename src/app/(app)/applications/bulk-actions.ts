"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { err, ok, type ActionResult } from "@/lib/action-result";
import { shiftReminder } from "@/lib/applications/snooze";
import { STAGE_LABEL, STAGES, type Stage } from "@/lib/applications/stages";
import { MAX_SELECTION } from "@/lib/selection";
import { actionContext, logActivity } from "@/lib/server/action-context";

/**
 * Moves many applications to one stage. Each row goes through set_application_stage with the version the page
 * loaded, so a row changed in another tab is skipped (and counted) rather than overwritten. The result carries
 * the new versions so Undo can move exactly those rows back, again with version checks.
 */

const item = z.object({ id: z.uuid(), version: z.number().int().min(0) });
const stage = z.enum(STAGES);

export type ApplicationsMove = { to: Stage; changed: { id: string; from: Stage; version: number }[]; skipped: number };

export async function bulkMoveStage(items: { id: string; version: number }[], to: Stage): Promise<ActionResult<ApplicationsMove>> {
  const parsed = z.array(item).min(1, "Select at least one application.").max(MAX_SELECTION, `Select up to ${MAX_SELECTION} applications at a time.`).safeParse(items);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Select at least one application.");
  const target = stage.safeParse(to);
  if (!target.success) return err("Unknown stage.");
  const ctx = await actionContext();

  const { data: rows, error } = await ctx.supabase.from("applications").select("id, stage").in("id", parsed.data.map((i) => i.id));
  if (error) return err("Couldn't move the applications you selected. Try again.");
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
  if (changed.length === 0) return err("None of these could be moved. They may already be in that stage, or changed in another tab. Reload and try again.");

  await logActivity(ctx, "applications.bulk_stage", { count: changed.length, to: target.data });
  refresh();
  return ok(`${changed.length} moved to ${STAGE_LABEL[target.data]}${skipped ? `. ${skipped} skipped.` : "."}`, { data: { to: target.data, changed, skipped } });
}

/** Moves the same rows back to the stage they were in, skipping any that changed since. */
export async function undoBulkMoveStage(move: ApplicationsMove): Promise<ActionResult> {
  const parsed = z
    .object({ to: stage, changed: z.array(z.object({ id: z.uuid(), from: stage, version: z.number().int().min(0) })).min(1).max(MAX_SELECTION), skipped: z.number() })
    .safeParse(move);
  if (!parsed.success) return err("Couldn't undo that. It may already have changed; reload the page to see where things stand.");
  const ctx = await actionContext();
  let restored = 0;
  for (const c of parsed.data.changed) {
    const { data: next, error } = await ctx.supabase.rpc("set_application_stage", { p_id: c.id, p_stage: c.from, p_expected_version: c.version });
    if (!error && next !== null) restored++;
  }
  refresh();
  if (restored === 0) return err("Couldn't undo that. The applications changed since.");
  const left = parsed.data.changed.length - restored;
  return ok(`${restored} moved back${left ? `. ${left} had changed since and were left alone.` : "."}`);
}

// ---------------------------------------------------------------- snooze reminders

export type ReminderSnooze = { days: number; applications: number; changed: { id: string; previous: string; next: string }[] };

/**
 * Moves every open reminder on the selected applications later by whole days, keeping each one's time of day in the
 * person's own time zone. Applications themselves are not changed. Returns what moved so Undo can put it back.
 */
export async function bulkSnoozeReminders(rawIds: string[], days: number): Promise<ActionResult<ReminderSnooze>> {
  const parsed = z.array(z.uuid()).min(1, "Select at least one application.").max(MAX_SELECTION, `Select up to ${MAX_SELECTION} applications at a time.`).safeParse(rawIds);
  const parsedDays = z.number().int().min(1).max(90).safeParse(days);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Select at least one application.");
  if (!parsedDays.success) return err("Choose between 1 and 90 days.");
  const ctx = await actionContext();

  const { data: rows, error } = await ctx.supabase
    .from("application_reminders")
    .select("id, application_id, due_at")
    .in("application_id", parsed.data)
    .is("done_at", null)
    .limit(1000);
  if (error) return err("Couldn't snooze the reminders. Try again.");
  if (rows.length === 0) return err("None of these applications have an open reminder.");

  const changed = rows.map((r) => ({ id: r.id, previous: r.due_at, next: shiftReminder(r.due_at, parsedDays.data, ctx.settings.timezone).toISOString() }));
  for (let i = 0; i < changed.length; i += 25) {
    const results = await Promise.all(changed.slice(i, i + 25).map((c) => ctx.supabase.from("application_reminders").update({ due_at: c.next }).eq("id", c.id).eq("due_at", c.previous)));
    if (results.some((r) => r.error)) return err("Couldn't snooze every reminder. Some may have moved; check the applications.");
  }
  await logActivity(ctx, "applications.bulk_snooze", { reminders: changed.length, applications: new Set(rows.map((r) => r.application_id)).size, days: parsedDays.data });
  refresh();
  const applications = new Set(rows.map((r) => r.application_id)).size;
  return ok(`${changed.length} reminder${changed.length === 1 ? "" : "s"} on ${applications} application${applications === 1 ? "" : "s"} moved ${parsedDays.data} days later.`, {
    data: { days: parsedDays.data, applications, changed },
  });
}

/** Puts the reminders back where they were, but only the ones nobody has moved or finished since. */
export async function undoBulkSnoozeReminders(snooze: ReminderSnooze): Promise<ActionResult> {
  const parsed = z
    .object({ days: z.number(), applications: z.number(), changed: z.array(z.object({ id: z.uuid(), previous: z.string(), next: z.string() })).min(1).max(1000) })
    .safeParse(snooze);
  if (!parsed.success) return err("Couldn't undo that. It may already have changed; reload the page to see where things stand.");
  const ctx = await actionContext();
  let restored = 0;
  for (let i = 0; i < parsed.data.changed.length; i += 25) {
    const results = await Promise.all(
      parsed.data.changed.slice(i, i + 25).map((c) =>
        ctx.supabase.from("application_reminders").update({ due_at: c.previous }).eq("id", c.id).eq("due_at", c.next).is("done_at", null).select("id"),
      ),
    );
    for (const r of results) if (!r.error && r.data.length) restored++;
  }
  refresh();
  if (restored === 0) return err("Couldn't undo that. The reminders changed since.");
  return ok(`${restored} reminder${restored === 1 ? "" : "s"} moved back.`);
}
