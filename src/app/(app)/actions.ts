"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isValidTimeZone, localDate, startOfLocalDay } from "@/lib/dates";
import { DISCIPLINE_LABELS, type Discipline, type University } from "@/lib/domain";
import {
  failed,
  firstIssue,
  formDate,
  formInt,
  optionalFormInt,
  saved,
  type FormState,
} from "@/lib/form-state";
import { actionContext as context, logActivity as log } from "@/lib/server/action-context";

// LinkedIn caps a member's network at 30,000 connections.
const MAX_CONNECTIONS = 30_000;
const DISCIPLINES = Object.keys(DISCIPLINE_LABELS) as Discipline[];

/** A snapshot time for a chosen local date: now for today, local noon for past dates. */
function snapshotInstant(date: string, timeZone: string): string | FormState {
  const today = localDate(new Date(), timeZone);
  if (date > today) return failed("The date can't be in the future.");
  if (date === today) return new Date().toISOString();
  return new Date(startOfLocalDay(date, timeZone).getTime() + 12 * 3600_000).toISOString();
}

// ---------------------------------------------------------------- connection counts

const baselineSchema = z.object({
  baseline: formInt("Starting count", { max: MAX_CONNECTIONS }),
  startDate: formDate("Start date"),
});

export async function setBaseline(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = baselineSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(firstIssue(parsed.error));
  const ctx = await context();

  const recordedAt = snapshotInstant(parsed.data.startDate, ctx.settings.timezone);
  if (typeof recordedAt !== "string") return recordedAt;

  const { error } = await ctx.supabase
    .from("settings")
    .update({
      baseline_connections: parsed.data.baseline,
      project_start_date: parsed.data.startDate,
    })
    .eq("user_id", ctx.userId);
  if (error) return failed("Couldn't save the starting count. Try again.");

  // The starting count is also the first real data point for the network total.
  const snap = await ctx.supabase.from("connection_snapshots").insert({
    user_id: ctx.userId,
    total_connections: parsed.data.baseline,
    recorded_at: recordedAt,
  });
  if (snap.error) return failed("Saved the baseline, but couldn't record the snapshot.");

  await log(ctx, "baseline.set", { baseline: parsed.data.baseline, start: parsed.data.startDate });
  refresh();
  return saved("Starting count saved.");
}

const snapshotSchema = z.object({
  total: formInt("Connection count", { max: MAX_CONNECTIONS }),
  date: formDate("Date"),
});

export async function recordSnapshot(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = snapshotSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(firstIssue(parsed.error));
  const ctx = await context();

  const recordedAt = snapshotInstant(parsed.data.date, ctx.settings.timezone);
  if (typeof recordedAt !== "string") return recordedAt;

  const { error } = await ctx.supabase.from("connection_snapshots").insert({
    user_id: ctx.userId,
    total_connections: parsed.data.total,
    recorded_at: recordedAt,
  });
  if (error) return failed("Couldn't record the count. Try again.");

  await log(ctx, "snapshot.recorded", { total: parsed.data.total, date: parsed.data.date });
  refresh();
  return saved(`Recorded ${parsed.data.total.toLocaleString("en-CA")} connections.`);
}

// ---------------------------------------------------------------- settings

const goalSchema = z.object({
  overallTarget: formInt("Overall target", { min: 1, max: MAX_CONNECTIONS }),
  baseline: optionalFormInt("Starting count", { max: MAX_CONNECTIONS }),
  startDate: formDate("Start date"),
});

export async function updateGoal(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = goalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(firstIssue(parsed.error));
  const { overallTarget, baseline, startDate } = parsed.data;
  if (baseline !== null && baseline >= overallTarget) {
    return failed("The overall target must be higher than your starting count.");
  }
  const ctx = await context();

  const { error } = await ctx.supabase
    .from("settings")
    .update({
      overall_target: overallTarget,
      baseline_connections: baseline,
      project_start_date: startDate,
    })
    .eq("user_id", ctx.userId);
  if (error) return failed("Couldn't save the goal. Try again.");

  await log(ctx, "settings.goal", { overallTarget, baseline, startDate });
  refresh();
  return saved();
}

const planningSchema = z.object({
  dailyInviteTarget: optionalFormInt("Daily invitation target", { max: 1000 }),
  weeklyInviteCap: optionalFormInt("Weekly invitation cap", { max: 5000 }),
  monthlyNoteAllowance: optionalFormInt("Monthly note allowance", { max: 1000 }),
  noteCharLimit: formInt("Note length limit", { min: 1, max: 1000 }),
  stalePendingDays: formInt("Stale invitation age", { min: 1, max: 365 }),
  timezone: z.string().refine(isValidTimeZone, "Choose a valid time zone."),
  countUbcoAsUbc: z.preprocess((v) => v === "on", z.boolean()),
  autoApprove: z.preprocess((v) => v === "on", z.boolean()),
});

export async function updatePlanning(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = planningSchema.safeParse({
    ...Object.fromEntries(formData),
    countUbcoAsUbc: formData.get("countUbcoAsUbc"),
    autoApprove: formData.get("autoApprove"),
  });
  if (!parsed.success) return failed(firstIssue(parsed.error));
  const d = parsed.data;
  const ctx = await context();

  const { error } = await ctx.supabase
    .from("settings")
    .update({
      daily_invite_target: d.dailyInviteTarget,
      weekly_invite_cap: d.weeklyInviteCap,
      monthly_note_allowance: d.monthlyNoteAllowance,
      note_char_limit: d.noteCharLimit,
      stale_pending_days: d.stalePendingDays,
      timezone: d.timezone,
      count_ubco_as_ubc: d.countUbcoAsUbc,
      auto_approve: d.autoApprove,
    })
    .eq("user_id", ctx.userId);
  if (error) return failed("Couldn't save planning settings. Try again.");

  await log(ctx, "settings.planning", d);
  refresh();
  return saved();
}

export async function updateTargets(_: FormState, formData: FormData): Promise<FormState> {
  const rows: { discipline: Discipline; university: University | null; target_count: number }[] = [];
  for (const discipline of DISCIPLINES) {
    for (const university of [null, "uoft", "ubc"] as const) {
      const field = `${discipline}.${university ?? "total"}`;
      const label = `${DISCIPLINE_LABELS[discipline]} ${university ? university.toUpperCase() : "total"}`;
      const parsed = formInt(label, { max: MAX_CONNECTIONS }).safeParse(formData.get(field));
      if (!parsed.success) return failed(firstIssue(parsed.error));
      rows.push({ discipline, university, target_count: parsed.data });
    }
  }
  const ctx = await context();

  for (const row of rows) {
    let query = ctx.supabase
      .from("targets")
      .update({ target_count: row.target_count })
      .eq("user_id", ctx.userId)
      .eq("discipline", row.discipline);
    query = row.university ? query.eq("university", row.university) : query.is("university", null);
    const { error } = await query;
    if (error) return failed("Couldn't save every target. Reload and check the values.");
  }

  await log(ctx, "settings.targets", {
    targets: rows.map((r) => [r.discipline, r.university, r.target_count]),
  });
  refresh();

  const over = DISCIPLINES.filter((d) => {
    const [total, ...cells] = rows.filter((r) => r.discipline === d).map((r) => r.target_count);
    return cells.reduce((a, b) => a + b, 0) > total;
  });
  return saved(
    over.length
      ? `Saved. Note: U of T + UBC targets exceed the total for ${over.map((d) => DISCIPLINE_LABELS[d]).join(", ")}.`
      : undefined,
  );
}

const moveSchema = z.object({
  discipline: z.enum(["ce", "ee", "mech", "cs"]),
  direction: z.enum(["up", "down"]),
});

export async function moveDiscipline(formData: FormData): Promise<void> {
  const parsed = moveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const ctx = await context();

  const order = [...ctx.settings.discipline_priority];
  const i = order.indexOf(parsed.data.discipline);
  const j = parsed.data.direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= order.length) return;
  [order[i], order[j]] = [order[j], order[i]];

  const { error } = await ctx.supabase
    .from("settings")
    .update({ discipline_priority: order })
    .eq("user_id", ctx.userId);
  if (error) throw error;

  await log(ctx, "settings.priority", { order });
  refresh();
}

const pauseSchema = z.object({
  reason: z.string().trim().max(500, "Keep the reason under 500 characters.").optional(),
});

export async function pauseOutreach(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = pauseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(firstIssue(parsed.error));
  const ctx = await context();

  const { error } = await ctx.supabase
    .from("settings")
    .update({ paused: true, pause_reason: parsed.data.reason || null, paused_at: new Date().toISOString() })
    .eq("user_id", ctx.userId);
  if (error) return failed("Couldn't pause outreach. Try again.");

  await log(ctx, "outreach.paused");
  refresh();
  return saved("Outreach paused.");
}

export async function resumeOutreach(): Promise<FormState> {
  const ctx = await context();
  const { error } = await ctx.supabase
    .from("settings")
    .update({ paused: false, pause_reason: null, paused_at: null })
    .eq("user_id", ctx.userId);
  if (error) return failed("Couldn't resume outreach. Try again.");

  await log(ctx, "outreach.resumed");
  refresh();
  return saved("Outreach resumed.");
}

/** Runs the daily job now for the signed-in user only (same code as the scheduled run). */
export async function runDailyJobNow(): Promise<FormState> {
  const ctx = await context();
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { runDailyJobForUser } = await import("@/lib/jobs/daily");
  try {
    // The user id comes from the verified session, never from the form.
    const r = await runDailyJobForUser(createAdminClient(), ctx.userId, { force: true });
    refresh();
    if (r.status === "failed") return failed("The job failed. Details are in the run history below.");
    if (r.status === "skipped") return saved("A run is already in progress.");
    const st = r.stats!;
    return saved(`Done: ${st.queued} queued, ${st.reclassified} classified, ${st.markedPending} marked pending.`);
  } catch {
    return failed("Couldn't run the job. Try again.");
  }
}

const profileSchema = z.object({
  mySchool: z.string().trim().max(200, "Keep the school under 200 characters."),
  myProgram: z.string().trim().max(200, "Keep the program under 200 characters."),
  myInterests: z.string().trim().max(300, "Keep interests under 300 characters."),
});

/** What the user says about themselves, used only to word connection notes. */
export async function updateNoteProfile(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(firstIssue(parsed.error));
  const ctx = await context();
  const { error } = await ctx.supabase
    .from("settings")
    .update({
      my_school_text: parsed.data.mySchool || null,
      my_program_text: parsed.data.myProgram || null,
      my_interests: parsed.data.myInterests || null,
    })
    .eq("user_id", ctx.userId);
  if (error) return failed("Couldn't save. Try again.");
  await log(ctx, "settings.profile");
  refresh();
  return saved("Saved. New queue items will use it; refresh today's queue to update existing ones.");
}

/**
 * Permanently deletes the signed-in user's account. Every table references the
 * auth user with ON DELETE CASCADE, so all of their data goes with it.
 */
export async function deleteAccount(_: FormState, formData: FormData): Promise<FormState> {
  if (formData.get("confirm") !== "DELETE") return failed("Type DELETE to confirm.");
  const ctx = await context();
  const { createAdminClient } = await import("@/lib/supabase/admin");
  // The id comes from the verified session, never from the form.
  const { error } = await createAdminClient().auth.admin.deleteUser(ctx.userId);
  if (error) return failed("Couldn't delete the account. Try again.");
  await ctx.supabase.auth.signOut();
  redirect("/login");
}
