"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { err, ok, type ActionResult } from "@/lib/action-result";
import { isValidTimeZone, localDateTimeToInstant } from "@/lib/dates";
import { describeMove, PAY_PERIODS, STAGE_LABEL, STAGES, type Stage } from "@/lib/applications/stages";
import { actionContext, logActivity, type ActionContext } from "@/lib/server/action-context";
import type { Json } from "@/lib/supabase/database.types";

/**
 * The application tracker. Stage moves go through set_application_stage, which changes
 * the stage and writes the timeline together and refuses a stale version. Everything
 * else is the user's own rows under row-level security. Nothing here sends anything to
 * an employer: it records what the user did.
 */

const uuid = z.uuid();
const stage = z.enum(STAGES);
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Pick a date and time.");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");
const timeZone = z.string().max(64).refine(isValidTimeZone, "Pick a valid time zone.");

type Db = ActionContext["supabase"];
type PgError = { code?: string } | null;

function failure(error: PgError, fallback: string): ActionResult<never> {
  if (error?.code === "40001") return err("This application changed in another tab or window. Reload the page and try again.");
  if (error?.code === "23505") return err("Another attempt at this job is still open. Close that one first.");
  if (error?.code === "P0002") return err("That application wasn't found.");
  return err(fallback);
}

async function addEvent(db: Db, applicationId: string, kind: "note" | "response" | "interview" | "reminder" | "contact" | "document", detail: string, occurredAt?: string) {
  return db.from("application_events").insert({ application_id: applicationId, kind, detail: detail.slice(0, 2000), ...(occurredAt ? { occurred_at: occurredAt } : {}) }).select("id").single();
}

// ------------------------------------------------------------ stages

/** Moves an application. Returns the new version, which the Undo needs. */
export async function moveStage(applicationId: string, to: Stage, expectedVersion: number): Promise<ActionResult<{ version: number; from: Stage }>> {
  if (!uuid.safeParse(applicationId).success || !stage.safeParse(to).success || !Number.isInteger(expectedVersion)) return err("Unknown application.");
  const ctx = await actionContext();
  const { data: before } = await ctx.supabase.from("applications").select("stage").eq("id", applicationId).maybeSingle();
  if (!before) return err("That application wasn't found.");
  const { data: version, error } = await ctx.supabase.rpc("set_application_stage", { p_id: applicationId, p_stage: to, p_expected_version: expectedVersion });
  if (error || version === null) return failure(error, "Couldn't move it. Try again.");
  await logActivity(ctx, "applications.stage", { application: applicationId, to });
  refresh();
  return ok(describeMove(before.stage, to), { data: { version, from: before.stage } });
}

/** Starts a new attempt at a job after the last one closed. */
export async function applyAgain(applicationId: string, to: "saved" | "applied"): Promise<ActionResult<{ id: string }>> {
  if (!uuid.safeParse(applicationId).success || !["saved", "applied"].includes(to)) return err("Unknown application.");
  const ctx = await actionContext();
  const { data: id, error } = await ctx.supabase.rpc("apply_again", { p_id: applicationId, p_stage: to });
  if (error || !id) return failure(error, "Couldn't start a new attempt. Try again.");
  await logActivity(ctx, "applications.apply_again", { application: id });
  refresh();
  return ok(`New attempt started as ${STAGE_LABEL[to]}.`, { data: { id } });
}

// ------------------------------------------------------------ details

const Details = z
  .object({
    notes: z.string().max(10_000, "Keep notes under 10,000 characters."),
    appliedOn: isoDate.or(z.literal("")),
    payAmount: z.string().trim().regex(/^(\d{1,10}(\.\d{1,2})?)?$/, "Enter the pay as a number, like 85000 or 42.50."),
    payCurrency: z.string().trim().toUpperCase().regex(/^([A-Z]{3})?$/, "Use a three-letter currency code, like CAD."),
    payPeriod: z.enum(PAY_PERIODS).or(z.literal("")),
  })
  .refine((d) => [d.payAmount, d.payCurrency, d.payPeriod].every(Boolean) || [d.payAmount, d.payCurrency, d.payPeriod].every((v) => !v), {
    message: "Enter the pay amount, currency and period together, or leave all three empty.",
  });

export async function saveDetails(applicationId: string, input: z.input<typeof Details>): Promise<ActionResult> {
  if (!uuid.safeParse(applicationId).success) return err("Unknown application.");
  const parsed = Details.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Check the details and try again.");
  const d = parsed.data;
  const ctx = await actionContext();
  const { error } = await ctx.supabase
    .from("applications")
    .update({
      notes: d.notes.trim() || null,
      applied_on: d.appliedOn || null,
      offered_pay_amount: d.payAmount ? Number(d.payAmount) : null,
      offered_pay_currency: d.payCurrency || null,
      offered_pay_period: d.payPeriod || null,
    })
    .eq("id", applicationId);
  if (error) return failure(error, "Couldn't save. Try again.");
  refresh();
  return ok("Saved.");
}

// ------------------------------------------------------------ timeline notes

export async function addNote(applicationId: string, kind: "note" | "response", text: string): Promise<ActionResult<{ id: string }>> {
  const body = text.trim();
  if (!uuid.safeParse(applicationId).success || !["note", "response"].includes(kind)) return err("Unknown application.");
  if (!body || body.length > 2000) return err("Write a note of up to 2,000 characters.");
  const ctx = await actionContext();
  const { data, error } = await addEvent(ctx.supabase, applicationId, kind, body);
  if (error || !data) return failure(error, "Couldn't add it. Try again.");
  refresh();
  return ok(kind === "response" ? "Response recorded." : "Note added.", { data: { id: data.id } });
}

export async function deleteNote(eventId: string): Promise<ActionResult> {
  if (!uuid.safeParse(eventId).success) return err("Unknown note.");
  const ctx = await actionContext();
  const { error, count } = await ctx.supabase.from("application_events").delete({ count: "exact" }).eq("id", eventId);
  if (error || !count) return err("Couldn't remove it. Only notes and responses you added can be removed.");
  refresh();
  return ok("Removed.");
}

// ------------------------------------------------------------ interviews

const Interview = z.object({
  startsLocal: localDateTime,
  timezone: timeZone,
  durationMinutes: z.coerce.number().int().min(5, "At least 5 minutes.").max(1440, "At most 24 hours."),
  kind: z.enum(["phone", "video", "onsite", "technical", "other"]),
  location: z.string().trim().max(500),
  notes: z.string().trim().max(5000),
});
export type InterviewInput = z.input<typeof Interview>;

const KIND_WORD: Record<string, string> = { phone: "Phone", video: "Video", onsite: "On-site", technical: "Technical", other: "" };

export async function addInterview(applicationId: string, input: InterviewInput): Promise<ActionResult<{ id: string }>> {
  if (!uuid.safeParse(applicationId).success) return err("Unknown application.");
  const parsed = Interview.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Check the interview details.");
  const i = parsed.data;
  const ctx = await actionContext();
  const startsAt = localDateTimeToInstant(i.startsLocal, i.timezone).toISOString();
  const { data, error } = await ctx.supabase
    .from("application_interviews")
    .insert({ application_id: applicationId, starts_at: startsAt, timezone: i.timezone, duration_minutes: i.durationMinutes, kind: i.kind, location: i.location || null, notes: i.notes || null })
    .select("id")
    .single();
  if (error || !data) return failure(error, "Couldn't add the interview. Try again.");
  await addEvent(ctx.supabase, applicationId, "interview", `${KIND_WORD[i.kind]} interview scheduled for ${i.startsLocal.replace("T", " ")} (${i.timezone})`.trim());
  refresh();
  return ok("Interview added.", { data: { id: data.id } });
}

/**
 * Changes an interview. A new date or time needs `confirmTimeChange`: the UI asks the user
 * first, because the calendar copy they already exported will be replaced.
 */
export async function updateInterview(interviewId: string, input: InterviewInput, confirmTimeChange: boolean): Promise<ActionResult<{ needsConfirmation?: boolean }>> {
  if (!uuid.safeParse(interviewId).success) return err("Unknown interview.");
  const parsed = Interview.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Check the interview details.");
  const i = parsed.data;
  const ctx = await actionContext();
  const { data: current } = await ctx.supabase.from("application_interviews").select("application_id, starts_at, duration_minutes, ics_sequence").eq("id", interviewId).maybeSingle();
  if (!current) return err("That interview wasn't found.");
  const startsAt = localDateTimeToInstant(i.startsLocal, i.timezone).toISOString();
  const timeChanged = Date.parse(current.starts_at) !== Date.parse(startsAt) || current.duration_minutes !== i.durationMinutes;
  if (timeChanged && !confirmTimeChange) return err("Confirm the new date and time.", { data: { needsConfirmation: true } });
  const { error } = await ctx.supabase
    .from("application_interviews")
    .update({
      starts_at: startsAt,
      timezone: i.timezone,
      duration_minutes: i.durationMinutes,
      kind: i.kind,
      location: i.location || null,
      notes: i.notes || null,
      ...(timeChanged ? { ics_sequence: current.ics_sequence + 1 } : {}),
    })
    .eq("id", interviewId);
  if (error) return failure(error, "Couldn't save the interview. Try again.");
  if (timeChanged) await addEvent(ctx.supabase, current.application_id, "interview", `Interview moved to ${i.startsLocal.replace("T", " ")} (${i.timezone})`);
  refresh();
  return ok(timeChanged ? "Interview moved. Download the calendar file again to update your calendar." : "Interview saved.");
}

export async function deleteInterview(interviewId: string): Promise<ActionResult> {
  if (!uuid.safeParse(interviewId).success) return err("Unknown interview.");
  const ctx = await actionContext();
  const { data: gone, error } = await ctx.supabase.from("application_interviews").delete().eq("id", interviewId).select("application_id").maybeSingle();
  if (error || !gone) return err("Couldn't remove the interview. Try again.");
  await addEvent(ctx.supabase, gone.application_id, "interview", "Interview removed");
  refresh();
  return ok("Interview removed.");
}

// ------------------------------------------------------------ reminders

export async function addReminder(applicationId: string, dueLocal: string, text: string): Promise<ActionResult<{ id: string }>> {
  const body = text.trim();
  if (!uuid.safeParse(applicationId).success) return err("Unknown application.");
  if (!localDateTime.safeParse(dueLocal).success) return err("Pick when to be reminded.");
  if (!body || body.length > 500) return err("Say what to do, in up to 500 characters.");
  const ctx = await actionContext();
  const dueAt = localDateTimeToInstant(dueLocal, ctx.settings.timezone).toISOString();
  const { data, error } = await ctx.supabase.from("application_reminders").insert({ application_id: applicationId, due_at: dueAt, text: body }).select("id").single();
  if (error || !data) return failure(error, "Couldn't add the reminder. Try again.");
  await addEvent(ctx.supabase, applicationId, "reminder", `Reminder set: ${body}`);
  refresh();
  return ok("Reminder added.", { data: { id: data.id } });
}

export async function setReminderDone(reminderId: string, done: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(reminderId).success) return err("Unknown reminder.");
  const ctx = await actionContext();
  const { error, count } = await ctx.supabase.from("application_reminders").update({ done_at: done ? new Date().toISOString() : null }, { count: "exact" }).eq("id", reminderId);
  if (error || !count) return err("Couldn't update the reminder. Try again.");
  refresh();
  return ok(done ? "Reminder done." : "Reminder reopened.");
}

export async function deleteReminder(reminderId: string): Promise<ActionResult> {
  if (!uuid.safeParse(reminderId).success) return err("Unknown reminder.");
  const ctx = await actionContext();
  const { error, count } = await ctx.supabase.from("application_reminders").delete({ count: "exact" }).eq("id", reminderId);
  if (error || !count) return err("Couldn't remove the reminder. Try again.");
  refresh();
  return ok("Reminder removed.");
}

// ------------------------------------------------------------ contacts

const ROLES = ["recruiter", "hiring_manager", "referrer", "interviewer", "other"] as const;

export async function linkContact(applicationId: string, personId: string, role: (typeof ROLES)[number]): Promise<ActionResult> {
  if (!uuid.safeParse(applicationId).success || !uuid.safeParse(personId).success || !ROLES.includes(role)) return err("Unknown contact.");
  const ctx = await actionContext();
  // The composite foreign key rejects a person who isn't the user's own.
  const { error } = await ctx.supabase.from("application_contacts").upsert({ application_id: applicationId, person_id: personId, role }, { onConflict: "application_id,person_id" });
  if (error) return err(error.code === "23503" ? "That person isn't in your People." : "Couldn't link them. Try again.");
  const { data: person } = await ctx.supabase.from("network_people").select("full_name").eq("id", personId).maybeSingle();
  await addEvent(ctx.supabase, applicationId, "contact", `${person?.full_name ?? "A contact"} linked as ${role.replace("_", " ")}`);
  refresh();
  return ok("Contact linked.");
}

export async function unlinkContact(applicationId: string, personId: string): Promise<ActionResult> {
  if (!uuid.safeParse(applicationId).success || !uuid.safeParse(personId).success) return err("Unknown contact.");
  const ctx = await actionContext();
  const { error, count } = await ctx.supabase.from("application_contacts").delete({ count: "exact" }).eq("application_id", applicationId).eq("person_id", personId);
  if (error || !count) return err("Couldn't unlink them. Try again.");
  refresh();
  return ok("Contact unlinked.");
}

// ------------------------------------------------------------ documents

/**
 * Records which document version was sent, with a copy taken now. Either a tailored
 * document (its edited text if the user edited it) or a resume version.
 */
export async function linkDocument(applicationId: string, source: { tailoredId?: string; resumeId?: string }): Promise<ActionResult> {
  if (!uuid.safeParse(applicationId).success) return err("Unknown application.");
  const ctx = await actionContext();
  const res = await snapshotDocument(ctx.supabase, applicationId, source);
  if (!res.ok) return res;
  await addEvent(ctx.supabase, applicationId, "document", `Sent: ${res.label}`);
  refresh();
  return ok("Document linked.");
}

async function snapshotDocument(db: Db, applicationId: string, source: { tailoredId?: string; resumeId?: string }): Promise<{ ok: true; label: string } | { ok: false; error: string }> {
  let row: { kind: "resume" | "cover_letter" | "cv"; label: string; content: NonNullable<Json>; tailored_document_id?: string; resume_id?: string } | null = null;
  if (source.tailoredId && uuid.safeParse(source.tailoredId).success) {
    const { data } = await db.from("tailored_documents").select("id, kind, label, generated, edited, created_at").eq("id", source.tailoredId).is("deleted_at", null).maybeSingle();
    if (data) {
      const kind = data.kind as "resume" | "cover_letter" | "cv";
      const name = { resume: "Tailored resume", cover_letter: "Cover letter", cv: "Tailored CV" }[kind];
      row = { kind, label: data.label ?? `${name}, ${data.created_at.slice(0, 10)}${data.edited ? " (edited)" : ""}`, content: (data.edited ?? data.generated) as NonNullable<Json>, tailored_document_id: data.id };
    }
  } else if (source.resumeId && uuid.safeParse(source.resumeId).success) {
    const { data } = await db.from("resumes").select("id, label, profile, raw_text").eq("id", source.resumeId).maybeSingle();
    if (data) row = { kind: "resume", label: `Resume: ${data.label}`, content: { profile: data.profile, text: data.raw_text } as NonNullable<Json>, resume_id: data.id };
  }
  if (!row) return { ok: false, error: "That document wasn't found." };
  const { error } = await db.from("application_documents").insert({ application_id: applicationId, ...row });
  if (error) return { ok: false, error: "Couldn't link the document. Try again." };
  return { ok: true, label: row.label };
}

export async function unlinkDocument(linkId: string): Promise<ActionResult> {
  if (!uuid.safeParse(linkId).success) return err("Unknown document.");
  const ctx = await actionContext();
  const { error, count } = await ctx.supabase.from("application_documents").delete({ count: "exact" }).eq("id", linkId);
  if (error || !count) return err("Couldn't unlink it. Try again.");
  refresh();
  return ok("Document unlinked.");
}

// ------------------------------------------------------------ from the Apply link

/**
 * "Mark as applied?" after the user opened a verified Apply link. Opening the link never
 * counts as applying: this runs only when the user confirms, with the date they give.
 */
export async function markApplied(jobId: string, appliedOn: string, document: { tailoredId?: string; resumeId?: string } | null): Promise<ActionResult<{ applicationId: string }>> {
  if (!uuid.safeParse(jobId).success) return err("Unknown job.");
  if (!isoDate.safeParse(appliedOn).success) return err("Pick the date you applied.");
  const ctx = await actionContext();
  const { error: stateError } = await ctx.supabase
    .from("job_user_states")
    .upsert({ user_id: ctx.userId, job_id: jobId, status: "applied", applied_at: localDateTimeToInstant(`${appliedOn}T12:00`, ctx.settings.timezone).toISOString() }, { onConflict: "user_id,job_id" });
  if (stateError) return err("Couldn't mark it as applied. Try again.");
  const { data: applicationId, error } = await ctx.supabase.rpc("sync_application_for_job", { p_job: jobId, p_stage: "applied" });
  if (error) return failure(error, "Couldn't record the application. Try again.");
  if (!applicationId) return err("Your last application to this job is closed. Open it in Applications and choose Apply again.");
  await ctx.supabase.from("applications").update({ applied_on: appliedOn }).eq("id", applicationId);
  if (document && (document.tailoredId || document.resumeId)) {
    const linked = await snapshotDocument(ctx.supabase, applicationId, document);
    if (linked.ok) await addEvent(ctx.supabase, applicationId, "document", `Sent: ${linked.label}`);
  }
  await logActivity(ctx, "jobs.applied", { job: jobId });
  refresh();
  return ok("Marked as applied.", { data: { applicationId } });
}
