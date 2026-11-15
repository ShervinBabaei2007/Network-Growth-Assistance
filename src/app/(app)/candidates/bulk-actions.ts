"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { MAX_SELECTION } from "@/lib/selection";
import { restoreByPrevious, selectedIds, withSkipped } from "@/lib/server/bulk-change";
import { done, fail, mutate } from "@/lib/server/mutation";

/**
 * Bulk changes to candidates. Each bulk action applies the same rules as the single-row one,
 * skips rows that rule would refuse (and says how many), and returns what it changed so Undo can put it back.
 * Everything runs under the user's own row-level security.
 */

const REVIEW_STATUSES = ["awaiting_review", "approved", "not_a_match", "do_not_contact"] as const;
type ReviewStatus = (typeof REVIEW_STATUSES)[number];
const ANY_STATUS = ["new", ...REVIEW_STATUSES] as const;

export type BulkStatusChange = { changed: { id: string; previous: (typeof ANY_STATUS)[number] }[]; skipped: number; status: ReviewStatus };

/**
 * Sets a review decision on many people. A person with an invitation on record is left alone (their status follows
 * the invitation) unless the decision is "do not contact", and approving needs the school and program confirmed.
 */
export async function bulkSetStatus(rawIds: string[], status: ReviewStatus): Promise<ActionResult<BulkStatusChange>> {
  return mutate<BulkStatusChange>({}, async ({ ctx }) => {
    const picked = selectedIds(rawIds, "people");
    if (!Array.isArray(picked)) return picked;
    if (!REVIEW_STATUSES.includes(status)) return fail("candidatesPage.bulkUnknownStatus");

    const { data: rows, error } = await ctx.supabase
      .from("candidates")
      .select("id, status, university_confidence, discipline_confidence, invitations(id)")
      .in("id", picked);
    if (error) return fail("candidatesPage.bulkUpdateFailed");

    const eligible = rows.filter((c) => {
      if (c.status === status) return false;
      if (c.invitations.length > 0 && status !== "do_not_contact") return false;
      if (status === "approved" && (c.university_confidence !== "confirmed" || c.discipline_confidence !== "confirmed")) return false;
      return true;
    });
    const skipped = picked.length - eligible.length;
    if (eligible.length === 0) return fail("candidatesPage.bulkNoneEligible");

    const { error: updateError } = await ctx.supabase.from("candidates").update({ status }).in("id", eligible.map((c) => c.id));
    if (updateError) return fail("candidatesPage.bulkUpdateFailed");

    const changed = eligible.map((c) => ({ id: c.id, previous: c.status as (typeof ANY_STATUS)[number] }));
    return done((t) => withSkipped(t, t("candidatesPage.bulkDone", { count: eligible.length, label: t(`bulkLabel.${status}`) }), skipped, "candidatesPage.bulkSkipped"), {
      data: { changed, skipped, status },
      log: ["candidate.bulk_status", { count: eligible.length, status }],
    });
  });
}

/** Puts people back to the status they had, but only if nothing has changed them since. */
export async function undoBulkStatus(change: BulkStatusChange): Promise<ActionResult> {
  return mutate({}, async ({ ctx }) => {
    const parsed = z
      .object({
        status: z.enum(REVIEW_STATUSES),
        changed: z.array(z.object({ id: z.uuid(), previous: z.enum(ANY_STATUS) })).min(1).max(MAX_SELECTION),
      })
      .safeParse(change);
    if (!parsed.success) return fail("candidatesPage.bulkUndoFailed");
    const restored = await restoreByPrevious(parsed.data.changed, (previous, ids) => ctx.supabase.from("candidates").update({ status: previous }).in("id", ids).eq("status", parsed.data.status));
    if (!restored) return fail("candidatesPage.bulkUndoRetry");
    return done("candidatesPage.bulkRestored", { params: { count: parsed.data.changed.length } });
  });
}

/** Permanently deletes people and their invitation records. The caller asks for confirmation first; there is no undo. */
export async function bulkDeleteCandidates(rawIds: string[]): Promise<ActionResult> {
  return mutate({}, async ({ ctx }) => {
    const picked = selectedIds(rawIds, "people");
    if (!Array.isArray(picked)) return picked;
    const { error, count } = await ctx.supabase.from("candidates").delete({ count: "exact" }).in("id", picked);
    if (error) return fail("candidatesPage.bulkDeleteFailed");
    return done("candidatesPage.bulkDeleted", { params: { count: count ?? 0 }, log: ["candidate.bulk_deleted", { count: count ?? 0 }] });
  });
}
