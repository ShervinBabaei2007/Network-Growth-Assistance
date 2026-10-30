"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { err, ok, type ActionResult } from "@/lib/action-result";
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
  if (!parsed.success) return err("Couldn't undo that.");
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
