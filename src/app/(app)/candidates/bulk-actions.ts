"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { err, ok, type ActionResult } from "@/lib/action-result";
import { MAX_SELECTION } from "@/lib/selection";
import { actionContext, logActivity } from "@/lib/server/action-context";
import { isViewPage, MAX_VIEW_NAME, normalizeViewQuery } from "@/lib/views";

/**
 * Bulk changes to candidates and saved views. Each bulk action applies the same rules as the single-row one,
 * skips rows that rule would refuse (and says how many), and returns what it changed so Undo can put it back.
 * Everything runs under the user's own row-level security.
 */

const ids = z.array(z.uuid()).min(1, "Select at least one person.").max(MAX_SELECTION, `Select up to ${MAX_SELECTION} people at a time.`);
const REVIEW_STATUSES = ["awaiting_review", "approved", "not_a_match", "do_not_contact"] as const;
type ReviewStatus = (typeof REVIEW_STATUSES)[number];
const ANY_STATUS = ["new", ...REVIEW_STATUSES] as const;

export type BulkStatusChange = { changed: { id: string; previous: (typeof ANY_STATUS)[number] }[]; skipped: number; status: ReviewStatus };

/**
 * Sets a review decision on many people. A person with an invitation on record is left alone (their status follows
 * the invitation) unless the decision is "do not contact", and approving needs the school and program confirmed.
 */
export async function bulkSetStatus(rawIds: string[], status: ReviewStatus): Promise<ActionResult<BulkStatusChange>> {
  const parsed = ids.safeParse(rawIds);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Select at least one person.");
  if (!REVIEW_STATUSES.includes(status)) return err("Unknown status.");
  const ctx = await actionContext();

  const { data: rows, error } = await ctx.supabase
    .from("candidates")
    .select("id, status, university_confidence, discipline_confidence, invitations(id)")
    .in("id", parsed.data);
  if (error) return err("Couldn't update the people you selected. Try again.");

  const eligible = rows.filter((c) => {
    if (c.status === status) return false;
    if (c.invitations.length > 0 && status !== "do_not_contact") return false;
    if (status === "approved" && (c.university_confidence !== "confirmed" || c.discipline_confidence !== "confirmed")) return false;
    return true;
  });
  const skipped = parsed.data.length - eligible.length;
  if (eligible.length === 0) return err("None of these people can be changed that way. Approving needs the school and program confirmed, and people with an invitation keep their status.");

  const { error: updateError } = await ctx.supabase.from("candidates").update({ status }).in("id", eligible.map((c) => c.id));
  if (updateError) return err("Couldn't update the people you selected. Try again.");

  await logActivity(ctx, "candidate.bulk_status", { count: eligible.length, status });
  refresh();
  const changed = eligible.map((c) => ({ id: c.id, previous: c.status as (typeof ANY_STATUS)[number] }));
  const label = status.replace(/_/g, " ");
  return ok(`${eligible.length} marked ${label}${skipped ? `. ${skipped} skipped.` : "."}`, { data: { changed, skipped, status } });
}

/** Puts people back to the status they had, but only if nothing has changed them since. */
export async function undoBulkStatus(change: BulkStatusChange): Promise<ActionResult> {
  const parsed = z
    .object({
      status: z.enum(REVIEW_STATUSES),
      changed: z.array(z.object({ id: z.uuid(), previous: z.enum(ANY_STATUS) })).min(1).max(MAX_SELECTION),
    })
    .safeParse(change);
  if (!parsed.success) return err("Couldn't undo that.");
  const ctx = await actionContext();
  const byPrevious = new Map<string, string[]>();
  for (const c of parsed.data.changed) byPrevious.set(c.previous, [...(byPrevious.get(c.previous) ?? []), c.id]);
  for (const [previous, group] of byPrevious) {
    const { error } = await ctx.supabase
      .from("candidates")
      .update({ status: previous as (typeof ANY_STATUS)[number] })
      .in("id", group)
      .eq("status", parsed.data.status);
    if (error) return err("Couldn't undo that. Try again.");
  }
  refresh();
  return ok(`${parsed.data.changed.length} restored.`);
}

/** Permanently deletes people and their invitation records. The caller asks for confirmation first; there is no undo. */
export async function bulkDeleteCandidates(rawIds: string[]): Promise<ActionResult> {
  const parsed = ids.safeParse(rawIds);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Select at least one person.");
  const ctx = await actionContext();
  const { error, count } = await ctx.supabase.from("candidates").delete({ count: "exact" }).in("id", parsed.data);
  if (error) return err("Couldn't delete the people you selected. Try again.");
  await logActivity(ctx, "candidate.bulk_deleted", { count: count ?? 0 });
  refresh();
  return ok(`${count ?? 0} deleted.`);
}

// ---------------------------------------------------------------- saved views

const viewName = z.string().trim().min(1, "Give the view a name.").max(MAX_VIEW_NAME, `Use ${MAX_VIEW_NAME} characters or fewer.`);

export async function saveView(page: string, name: string, search: string): Promise<ActionResult<{ id: string }>> {
  if (!isViewPage(page)) return err("Unknown page.");
  const parsedName = viewName.safeParse(name);
  if (!parsedName.success) return err(parsedName.error.issues[0]?.message ?? "Give the view a name.");
  const query = normalizeViewQuery(page, search);
  if (!query) return err("Choose at least one filter first, then save the view.");
  const ctx = await actionContext();
  const { data, error } = await ctx.supabase.from("saved_views").insert({ page, name: parsedName.data, query }).select("id").single();
  if (error) {
    if (error.code === "23505") return err("You already have a view with that name.");
    if (error.code === "P0001") return err("You can keep up to 30 saved views. Delete one first.");
    return err("Couldn't save the view. Try again.");
  }
  refresh();
  return ok(`Saved “${parsedName.data}”.`, { data: { id: data.id } });
}

export async function deleteView(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return err("Unknown view.");
  const ctx = await actionContext();
  const { error, count } = await ctx.supabase.from("saved_views").delete({ count: "exact" }).eq("id", id);
  if (error || !count) return err("Couldn't delete the view. Try again.");
  refresh();
  return ok("View deleted.");
}
