"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isValidTimeZone, localDate, startOfLocalDay } from "@/lib/dates";
import { classifyCandidate } from "@/lib/classify";
import { loadCatalog } from "@/lib/data/catalog";
import { targetUniversities, type Discipline, type University } from "@/lib/domain";
import {
  failed,
  firstIssue,
  formDate,
  formInt,
  optionalFormInt,
  saved,
  type FormState,
} from "@/lib/form-state";
import { err, ok, type ActionResult } from "@/lib/action-result";
import { normalizeAppearance, type Appearance } from "@/lib/appearance";
import { onboardingInputSchema, onboardingPatchSchema, parseOnboarding, type OnboardingState } from "@/lib/onboarding/state";
import { actionContext as context, logActivity as log } from "@/lib/server/action-context";

// LinkedIn caps a member's network at 30,000 connections.
const MAX_CONNECTIONS = 30_000;

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
  overallTarget: optionalFormInt("Connection goal", { max: MAX_CONNECTIONS }),
  baseline: optionalFormInt("Starting count", { max: MAX_CONNECTIONS }),
  startDate: formDate("Start date"),
});

export async function updateGoal(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = goalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(firstIssue(parsed.error));
  const { overallTarget, baseline, startDate } = parsed.data;
  if (overallTarget !== null && overallTarget < 1) return failed("Set a goal of at least 1 connection, or leave it empty.");
  if (baseline !== null && overallTarget !== null && baseline >= overallTarget) {
    return failed("The goal must be higher than your starting count.");
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
  autoApprove: z.preprocess((v) => v === "on", z.boolean()),
});

export async function updatePlanning(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = planningSchema.safeParse({
    ...Object.fromEntries(formData),
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
      auto_approve: d.autoApprove,
    })
    .eq("user_id", ctx.userId);
  if (error) return failed("Couldn't save planning settings. Try again.");

  await log(ctx, "settings.planning", d);
  refresh();
  return saved();
}

/**
 * Targets for the user's own disciplines: a total per discipline, and a share for each of
 * their schools that has its own targets. An empty field means no target there.
 */
export async function updateTargets(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await context();
  const catalog = await loadCatalog(ctx.supabase);
  const set: { discipline: Discipline; university: University | null; target_count: number }[] = [];
  const cleared: { discipline: Discipline; university: University | null }[] = [];
  for (const d of catalog.disciplines) {
    for (const u of [null, ...targetUniversities(catalog)]) {
      const raw = formData.get(`${d.id}.${u?.id ?? "total"}`)?.toString().trim() ?? "";
      if (!raw) {
        cleared.push({ discipline: d.id, university: u?.id ?? null });
        continue;
      }
      const parsed = formInt(`${d.name} ${u ? u.name : "total"}`, { max: MAX_CONNECTIONS }).safeParse(raw);
      if (!parsed.success) return failed(firstIssue(parsed.error));
      set.push({ discipline: d.id, university: u?.id ?? null, target_count: parsed.data });
    }
  }

  if (set.length) {
    const { error } = await ctx.supabase.from("targets").upsert(set.map((r) => ({ ...r, user_id: ctx.userId })), { onConflict: "user_id,discipline,university" });
    if (error) return failed("Couldn't save the targets. Reload and check the values.");
  }
  for (const c of cleared) {
    let q = ctx.supabase.from("targets").delete().eq("user_id", ctx.userId).eq("discipline", c.discipline);
    q = c.university ? q.eq("university", c.university) : q.is("university", null);
    const { error } = await q;
    if (error) return failed("Couldn't clear every target. Reload and check the values.");
  }

  await log(ctx, "settings.targets", { set: set.length, cleared: cleared.length });
  refresh();

  const over = catalog.disciplines.filter((d) => {
    const total = set.find((r) => r.discipline === d.id && r.university === null)?.target_count;
    const cells = set.filter((r) => r.discipline === d.id && r.university !== null).reduce((n, r) => n + r.target_count, 0);
    return total !== undefined && cells > total;
  });
  return saved(over.length ? `Saved. Note: the school targets add up to more than the total for ${over.map((d) => d.name).join(", ")}.` : undefined);
}

// ---------------------------------------------------------------- your schools and disciplines

/** "UBC, University of British Columbia\nubc vancouver" → distinct, trimmed spellings. */
const spellings = (v: FormDataEntryValue | null) => [...new Set((v?.toString() ?? "").split(/[\n,;]/).map((x) => x.trim().replace(/\s+/g, " ")).filter(Boolean))];

const categorySchema = z.object({
  kind: z.enum(["university", "discipline"]),
  id: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.uuid().optional()),
  name: z.string().trim().min(1, "Add a name.").max(200, "Keep the name under 200 characters."),
  aliases: z.array(z.string().max(100, "Keep each spelling under 100 characters.")).max(40, "Use at most 40 other spellings."),
  hasTargets: z.boolean(),
});

/**
 * Re-sorts candidates whose school or discipline is still unconfirmed against the user's
 * current lists, after one changes. Only fills in what's unconfirmed; never overrides a
 * choice already confirmed. Returns how many candidates got a new match.
 */
async function sortUnconfirmed(ctx: Awaited<ReturnType<typeof context>>): Promise<number> {
  const catalog = await loadCatalog(ctx.supabase);
  const { data } = await ctx.supabase
    .from("candidates")
    .select("id, status, raw_school_text, raw_program_text, university_confidence, discipline_confidence")
    .or("university_confidence.eq.needs_review,discipline_confidence.eq.needs_review")
    .not("status", "in", "(not_a_match,do_not_contact)")
    .limit(2000);
  let sorted = 0;
  for (const c of data ?? []) {
    const r = classifyCandidate(c.raw_school_text, c.raw_program_text, catalog);
    const school = c.university_confidence === "needs_review" && r.university.confidence === "confirmed" ? r.university.value : null;
    const field = c.discipline_confidence === "needs_review" && r.discipline.confidence === "confirmed" ? r.discipline.value : null;
    if (!school && !field) continue;
    const both = (school !== null || c.university_confidence === "confirmed") && (field !== null || c.discipline_confidence === "confirmed");
    const { error } = await ctx.supabase
      .from("candidates")
      .update({
        ...(school ? { university: school, university_confidence: "confirmed" as const } : {}),
        ...(field ? { discipline: field, discipline_confidence: "confirmed" as const } : {}),
        ...(ctx.settings.auto_approve && both && (c.status === "new" || c.status === "awaiting_review") ? { status: "approved" as const } : {}),
      })
      .eq("id", c.id);
    if (!error) sorted++;
  }
  return sorted;
}

/** Adds or edits one of the user's schools or disciplines, then sorts unconfirmed candidates against it. */
export async function saveCategory(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = categorySchema.safeParse({
    kind: formData.get("kind"),
    id: formData.get("id"),
    name: formData.get("name"),
    aliases: spellings(formData.get("aliases")),
    hasTargets: formData.get("hasTargets") === "on",
  });
  if (!parsed.success) return failed(firstIssue(parsed.error));
  const { kind, id, name, aliases, hasTargets } = parsed.data;
  const ctx = await context();

  let error: { code?: string } | null;
  if (kind === "university") {
    const fields = { name, aliases, has_targets: hasTargets };
    if (id) ({ error } = await ctx.supabase.from("universities").update(fields).eq("id", id));
    else {
      const { data: last } = await ctx.supabase.from("universities").select("position").order("position", { ascending: false }).limit(1).maybeSingle();
      ({ error } = await ctx.supabase.from("universities").insert({ ...fields, user_id: ctx.userId, position: (last?.position ?? -1) + 1 }));
    }
  } else {
    const fields = { name, aliases };
    if (id) ({ error } = await ctx.supabase.from("disciplines").update(fields).eq("id", id));
    else {
      const { data: last } = await ctx.supabase.from("disciplines").select("position").order("position", { ascending: false }).limit(1).maybeSingle();
      ({ error } = await ctx.supabase.from("disciplines").insert({ ...fields, user_id: ctx.userId, position: (last?.position ?? -1) + 1 }));
    }
  }
  const what = kind === "university" ? "school" : "discipline";
  if (error?.code === "23505") return failed(`You already have a ${what} named “${name}”.`);
  if (error) return failed("Couldn't save. Try again.");

  const sorted = await sortUnconfirmed(ctx);
  await log(ctx, `settings.${kind}.${id ? "updated" : "added"}`, { sorted });
  refresh();
  return saved(`${id ? "Saved" : "Added"} “${name}”.${sorted ? ` ${sorted} candidate${sorted === 1 ? " was" : "s were"} matched to your lists.` : ""}`);
}

/** Removes a school or discipline. Its candidates go back to review and its targets are removed. */
export async function deleteCategory(kind: "university" | "discipline", id: string): Promise<ActionResult> {
  if ((kind !== "university" && kind !== "discipline") || !z.uuid().safeParse(id).success) return err("Unknown entry.");
  const ctx = await context();
  const { data, error } =
    kind === "university"
      ? await ctx.supabase.from("universities").delete().eq("id", id).select("name").maybeSingle()
      : await ctx.supabase.from("disciplines").delete().eq("id", id).select("name").maybeSingle();
  if (error || !data) return err("Couldn't remove it. Try again.");
  await log(ctx, `settings.${kind}.removed`);
  refresh();
  return ok(`Removed “${data.name}”. Its candidates are back in review.`);
}

const moveSchema = z.object({
  discipline: z.uuid(),
  direction: z.enum(["up", "down"]),
});

/** Moves a discipline up or down the user's priority order. */
export async function moveDiscipline(formData: FormData): Promise<void> {
  const parsed = moveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const ctx = await context();
  const order = (await loadCatalog(ctx.supabase)).disciplines.map((d) => d.id);
  const i = order.indexOf(parsed.data.discipline);
  const j = parsed.data.direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= order.length) return;
  [order[i], order[j]] = [order[j], order[i]];
  // Positions are rewritten 0..n so the order stays exact.
  for (const [position, id] of order.entries()) {
    const { error } = await ctx.supabase.from("disciplines").update({ position }).eq("id", id);
    if (error) throw error;
  }
  await log(ctx, "settings.priority", { moved: parsed.data.discipline, direction: parsed.data.direction });
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

// ---------------------------------------------------------------- appearance and tracker

/** Saves the theme, density and text size. The page applies them right away; this keeps them for every device. */
export async function saveAppearance(input: Appearance): Promise<ActionResult> {
  const a = normalizeAppearance(input);
  const ctx = await context();
  const { error } = await ctx.supabase.from("settings").update({ theme: a.theme, density: a.density, text_size: a.text }).eq("user_id", ctx.userId);
  if (error) return err("Couldn't save your appearance settings. Try again.");
  return ok("Appearance saved.");
}

/** Saves where the user is in the welcome and tour. Only the caller's own settings row can change. */
export async function saveOnboarding(patch: Partial<OnboardingState>): Promise<ActionResult> {
  const parsed = onboardingPatchSchema.safeParse(patch);
  if (!parsed.success) return err("Couldn't save your setup progress.");
  const ctx = await context();
  const { data: row, error: readError } = await ctx.supabase.from("settings").select("onboarding").eq("user_id", ctx.userId).single();
  if (readError) return err("Couldn't save your setup progress. Try again.");
  // Merge into what is stored, then check the whole thing, so only known fields are ever written.
  const merged = onboardingInputSchema.safeParse({ ...parseOnboarding(row.onboarding), ...parsed.data });
  if (!merged.success) return err("Couldn't save your setup progress.");
  const { error } = await ctx.supabase.from("settings").update({ onboarding: merged.data }).eq("user_id", ctx.userId);
  if (error) return err("Couldn't save your setup progress. Try again.");
  return ok("Saved.");
}

const trackerSchema = z.object({ noResponseDays: formInt("Days", { min: 1, max: 365 }) });

export async function updateTrackerSettings(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = trackerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(firstIssue(parsed.error));
  const ctx = await context();
  const { error } = await ctx.supabase.from("settings").update({ no_response_days: parsed.data.noResponseDays }).eq("user_id", ctx.userId);
  if (error) return failed("Couldn't save. Try again.");
  refresh();
  return saved("Saved.");
}

/**
 * Permanently deletes the signed-in user's account. Every table references the
 * auth user with ON DELETE CASCADE, so all of their data goes with it.
 */
export async function deleteAccount(_: FormState, formData: FormData): Promise<FormState> {
  if (formData.get("confirm") !== "DELETE") return failed("Type DELETE to confirm.");
  const ctx = await context();
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  // Stored files aren't removed with the user's rows: delete their uploaded resumes first.
  // The id comes from the verified session, never from the form.
  // Removing a page shifts the listing, so read the first page again until it's empty.
  for (let page = 0; page < 100; page++) {
    const { data: files, error: listError } = await admin.storage.from("resumes").list(ctx.userId, { limit: 100 });
    if (listError) return failed("Couldn't delete your stored files. Nothing was deleted; try again.");
    if (!files.length) break;
    const { error: removeError } = await admin.storage.from("resumes").remove(files.map((f) => `${ctx.userId}/${f.name}`));
    if (removeError) return failed("Couldn't delete your stored files. Your account wasn't deleted; try again.");
  }
  const { error } = await admin.auth.admin.deleteUser(ctx.userId);
  if (error) return failed("Couldn't delete the account. Try again.");
  await ctx.supabase.auth.signOut();
  redirect("/login");
}
