"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { err, ok, type ActionResult } from "@/lib/action-result";
import { loadCatalog } from "@/lib/data/catalog";
import { disciplineName, universityName } from "@/lib/domain";
import { localDate } from "@/lib/dates";
import { checkFollowUpDraft, FOLLOW_UP_LIMIT } from "@/lib/follow-ups/templates";
import { actionContext } from "@/lib/server/action-context";

/**
 * Follow-up suggestions after an accepted connection. These only record what the user did with a suggestion;
 * the app never sends a message. Everything runs under the user's own row-level security.
 */

const uuid = z.uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Marks a suggestion done or dismissed, or puts it back (used by Undo). */
export async function setFollowUpState(id: string, state: "suggested" | "done" | "dismissed"): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return err("Unknown follow-up.");
  const ctx = await actionContext();
  const { error, count } = await ctx.supabase
    .from("follow_ups")
    .update({ state, done_at: state === "done" ? new Date().toISOString() : null }, { count: "exact" })
    .eq("id", id);
  if (error || !count) return err("Couldn't update the follow-up. Try again.");
  refresh();
  return ok(state === "done" ? "Marked done." : state === "dismissed" ? "Dismissed." : "Back on your list.");
}

/** Moves a suggestion to a week from today in the user's time zone. */
export async function snoozeFollowUp(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return err("Unknown follow-up.");
  const ctx = await actionContext();
  const today = localDate(new Date(), ctx.settings.timezone);
  const due = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
  return setDue(id, due, "Snoozed for a week.");
}

/** Sets the due date directly (used by Undo to restore the previous date). */
export async function setFollowUpDue(id: string, dueOn: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || !isoDate.safeParse(dueOn).success) return err("Unknown follow-up.");
  return setDue(id, dueOn, "Date restored.");
}

async function setDue(id: string, dueOn: string, message: string): Promise<ActionResult> {
  const ctx = await actionContext();
  const { error, count } = await ctx.supabase.from("follow_ups").update({ due_on: dueOn }, { count: "exact" }).eq("id", id).eq("state", "suggested");
  if (error || !count) return err("Couldn't change the date. Try again.");
  refresh();
  return ok(message);
}

/**
 * Checks a message the user has edited against what the record knows, before they copy it. Returns a warning
 * rather than blocking: the message is theirs, but they should know if it states something we can't back up.
 */
export async function checkFollowUpText(id: string, text: string): Promise<ActionResult<{ problem: string | null }>> {
  if (!uuid.safeParse(id).success) return err("Unknown follow-up.");
  if (text.length > FOLLOW_UP_LIMIT * 3) return err("That message is too long.");
  const ctx = await actionContext();
  const { data, error } = await ctx.supabase.from("follow_ups").select("candidates(full_name, university, discipline)").eq("id", id).single();
  if (error || !data?.candidates) return err("Couldn't check the message. Try again.");
  const catalog = await loadCatalog(ctx.supabase);
  const c = data.candidates;
  const result = checkFollowUpDraft(text, {
    fullName: c.full_name,
    school: c.university ? universityName(catalog, c.university) : null,
    program: c.discipline ? disciplineName(catalog, c.discipline) : null,
  });
  return ok(undefined, { data: { problem: result.ok ? null : result.reason } });
}
