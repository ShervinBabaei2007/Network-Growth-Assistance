"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { classifyCandidate } from "@/lib/classify";
import { localDate, startOfLocalDay } from "@/lib/dates";
import { failed, firstIssue, formDate, saved, type FormState } from "@/lib/form-state";
import {
  detectMapping,
  prepareCandidateRows,
  type CandidateDraft,
  type ColumnMapping,
  type RowIssue,
} from "@/lib/imports/candidates-csv";
import { parseCsv } from "@/lib/imports/csv";
import { normalizeProfileUrl } from "@/lib/linkedin/normalize-url";
import { actionContext, logActivity, type ActionContext } from "@/lib/server/action-context";

const DISCIPLINES = ["ce", "ee", "mech", "cs"] as const;
const UNIVERSITIES = ["uoft", "ubc", "sfu", "waterloo"] as const;
const DEGREES = ["undergraduate", "masters", "doctoral", "alumni", "other"] as const;

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer.`)
    .optional()
    .transform((v) => v || null);

const optionalYear = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z.coerce.number().int("Graduation year must be a whole number.").min(1950).max(2100).nullable(),
);

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess((v) => (v === "" || v == null ? null : v), z.enum(values).nullable());

const candidateFields = {
  fullName: z.string().trim().min(1, "Enter the person's name.").max(200),
  schoolText: optionalText(300, "School"),
  programText: optionalText(300, "Program"),
  role: optionalText(300, "Role"),
  degreeLevel: optionalEnum(DEGREES),
  gradYear: optionalYear,
  notes: optionalText(2000, "Notes"),
};

function isDuplicate(error: { code?: string } | null) {
  return error?.code === "23505";
}

/** Postgres function errors carry a readable message; keep it, but only for known codes. */
function functionError(error: { code?: string; message: string }, fallback: string) {
  return ["P0001", "P0002", "23505", "22023"].includes(error.code ?? "") ? error.message : fallback;
}

// ---------------------------------------------------------------- add

const addSchema = z.object({
  profileUrl: z.string(),
  ...candidateFields,
  approve: z.preprocess((v) => v === "on", z.boolean()),
});

export async function addCandidate(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = addSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(firstIssue(parsed.error));
  const d = parsed.data;

  const url = normalizeProfileUrl(d.profileUrl);
  if (!url.ok) return failed(url.reason);

  const ctx = await actionContext();
  const { data: existing } = await ctx.supabase
    .from("candidates")
    .select("id, full_name")
    .eq("profile_key", url.key)
    .maybeSingle();
  if (existing) {
    return failed("This profile is already in your list.", {
      href: `/candidates/${existing.id}`,
      label: `Open ${existing.full_name}`,
    });
  }

  const c = classifyCandidate(d.schoolText, d.programText, {
    countUbcoAsUbc: ctx.settings.count_ubco_as_ubc,
  });
  const classified =
    c.university.confidence === "confirmed" && c.discipline.confidence === "confirmed";

  const { data: row, error } = await ctx.supabase
    .from("candidates")
    .insert({
      user_id: ctx.userId,
      full_name: d.fullName,
      profile_url: url.url,
      profile_key: url.key,
      raw_school_text: d.schoolText,
      raw_program_text: d.programText,
      role: d.role,
      degree_level: d.degreeLevel,
      grad_year: d.gradYear,
      notes: d.notes,
      university: c.university.value,
      discipline: c.discipline.value,
      university_confidence: c.university.confidence,
      discipline_confidence: c.discipline.confidence,
      source: "manual",
      status: d.approve && classified ? "approved" : "awaiting_review",
    })
    .select("id")
    .single();
  if (isDuplicate(error)) return failed("This profile is already in your list.");
  if (error || !row) return failed("Couldn't add the candidate. Try again.");

  await logActivity(ctx, "candidate.added", { candidate: row.id, source: "manual" });
  refresh();

  const link = { href: `/candidates/${row.id}`, label: "Open record" };
  if (d.approve && !classified) {
    return saved(
      "Added for review: the school or program needs confirming before it can be approved.",
      link,
    );
  }
  return saved(classified ? "Added." : "Added for review.", link);
}

// ---------------------------------------------------------------- edit

const updateSchema = z.object({ id: z.uuid(), ...candidateFields });

export async function updateCandidate(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(firstIssue(parsed.error));
  const d = parsed.data;
  const ctx = await actionContext();

  const { error } = await ctx.supabase
    .from("candidates")
    .update({
      full_name: d.fullName,
      raw_school_text: d.schoolText,
      raw_program_text: d.programText,
      role: d.role,
      degree_level: d.degreeLevel,
      grad_year: d.gradYear,
      notes: d.notes,
    })
    .eq("id", d.id);
  if (error) return failed("Couldn't save the changes. Try again.");

  await logActivity(ctx, "candidate.updated", { candidate: d.id });
  refresh();
  return saved();
}

const classificationSchema = z.object({
  id: z.uuid(),
  university: optionalEnum(UNIVERSITIES),
  discipline: optionalEnum(DISCIPLINES),
});

/** A person confirming the school and program; blank means "unknown, keep in review". */
export async function confirmClassification(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = classificationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(firstIssue(parsed.error));
  const { id, university, discipline } = parsed.data;
  const ctx = await actionContext();

  const { data: current } = await ctx.supabase.from("candidates").select("status").eq("id", id).single();
  const confirmedBoth = university !== null && discipline !== null;
  const { error } = await ctx.supabase
    .from("candidates")
    .update({
      university,
      discipline,
      university_confidence: university ? "confirmed" : "needs_review",
      discipline_confidence: discipline ? "confirmed" : "needs_review",
      // An approved person whose category is cleared goes back to review.
      ...(current?.status === "approved" && !confirmedBoth ? { status: "awaiting_review" as const } : {}),
    })
    .eq("id", id);
  if (error) return failed("Couldn't save the classification. Try again.");

  await logActivity(ctx, "candidate.classified", { candidate: id, university, discipline });
  refresh();
  return saved(confirmedBoth ? "Confirmed." : "Saved; still needs review.");
}

export async function reclassifyCandidate(_: FormState, formData: FormData): Promise<FormState> {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return failed("Unknown candidate.");
  const ctx = await actionContext();
  const { data: cand } = await ctx.supabase
    .from("candidates")
    .select("raw_school_text, raw_program_text")
    .eq("id", id.data)
    .single();
  if (!cand) return failed("Candidate not found.");

  const c = classifyCandidate(cand.raw_school_text, cand.raw_program_text, {
    countUbcoAsUbc: ctx.settings.count_ubco_as_ubc,
  });
  const { error } = await ctx.supabase
    .from("candidates")
    .update({
      university: c.university.value,
      discipline: c.discipline.value,
      university_confidence: c.university.confidence,
      discipline_confidence: c.discipline.confidence,
    })
    .eq("id", id.data);
  if (error) return failed("Couldn't re-run classification.");
  refresh();
  return saved(`${c.university.reason} ${c.discipline.reason}`);
}

// ---------------------------------------------------------------- status

const REVIEW_STATUSES = ["awaiting_review", "approved", "not_a_match", "do_not_contact"] as const;
const statusSchema = z.object({ id: z.uuid(), status: z.enum(REVIEW_STATUSES) });

/** Review decisions only; invitation statuses change through the invitation functions. */
export async function setCandidateStatus(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = statusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(firstIssue(parsed.error));
  const { id, status } = parsed.data;
  const ctx = await actionContext();

  const { data: cand } = await ctx.supabase
    .from("candidates")
    .select("status, university_confidence, discipline_confidence, invitations(id)")
    .eq("id", id)
    .single();
  if (!cand) return failed("Candidate not found.");
  if (cand.invitations.length > 0 && status !== "do_not_contact") {
    return failed("This person already has an invitation recorded. Change it in the invitation section.");
  }
  if (
    status === "approved" &&
    (cand.university_confidence !== "confirmed" || cand.discipline_confidence !== "confirmed")
  ) {
    return failed("Confirm the school and program before approving.");
  }

  const { error } = await ctx.supabase.from("candidates").update({ status }).eq("id", id);
  if (error) return failed("Couldn't update the status. Try again.");

  await logActivity(ctx, "candidate.status", { candidate: id, status });
  refresh();
  return saved();
}

// ---------------------------------------------------------------- invitations

function instantForDate(ctx: ActionContext, date: string): string | null {
  const today = localDate(new Date(), ctx.settings.timezone);
  if (date > today) return null;
  if (date === today) return new Date().toISOString();
  return new Date(startOfLocalDay(date, ctx.settings.timezone).getTime() + 12 * 3600_000).toISOString();
}

const sentSchema = z.object({
  id: z.uuid(),
  date: formDate("Date"),
  note: z.string().max(1000, "The note is too long.").optional(),
});

export async function recordInvitationSent(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = sentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(firstIssue(parsed.error));
  const ctx = await actionContext();
  if (ctx.settings.paused) {
    return failed("Outreach is paused. Resume it in Settings once LinkedIn's warning is resolved.");
  }
  const sentAt = instantForDate(ctx, parsed.data.date);
  if (!sentAt) return failed("The date can't be in the future.");

  const { error } = await ctx.supabase.rpc("record_invitation_sent", {
    p_candidate_id: parsed.data.id,
    p_sent_at: sentAt,
    p_note_text: parsed.data.note ?? undefined,
  });
  if (error) return failed(functionError(error, "Couldn't record the invitation."));

  await logActivity(ctx, "invitation.sent", { candidate: parsed.data.id });
  refresh();
  return saved("Invitation recorded.");
}

const resolveSchema = z.object({
  id: z.uuid(),
  outcome: z.enum(["accepted", "declined", "withdrawn"]),
  date: formDate("Date"),
});

export async function resolveInvitation(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = resolveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(firstIssue(parsed.error));
  const ctx = await actionContext();
  const at = instantForDate(ctx, parsed.data.date);
  if (!at) return failed("The date can't be in the future.");

  const { error } = await ctx.supabase.rpc("resolve_invitation", {
    p_candidate_id: parsed.data.id,
    p_outcome: parsed.data.outcome,
    p_resolved_at: at,
  });
  if (error) return failed(functionError(error, "Couldn't update the invitation."));

  await logActivity(ctx, `invitation.${parsed.data.outcome}`, { candidate: parsed.data.id });
  refresh();
  return saved(`Marked ${parsed.data.outcome}.`);
}

export async function deleteInvitation(_: FormState, formData: FormData): Promise<FormState> {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return failed("Unknown candidate.");
  if (formData.get("confirm") !== "on") return failed("Tick the box to confirm.");
  const ctx = await actionContext();

  const { error } = await ctx.supabase.rpc("delete_invitation", { p_candidate_id: id.data });
  if (error) return failed(functionError(error, "Couldn't remove the invitation."));

  await logActivity(ctx, "invitation.deleted", { candidate: id.data });
  refresh();
  return saved("Invitation record removed.");
}

export async function deleteCandidate(_: FormState, formData: FormData): Promise<FormState> {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return failed("Unknown candidate.");
  if (formData.get("confirm") !== "on") return failed("Tick the box to confirm.");
  const ctx = await actionContext();

  const { error } = await ctx.supabase.from("candidates").delete().eq("id", id.data);
  if (error) return failed("Couldn't delete the record. Try again.");

  await logActivity(ctx, "candidate.deleted", { candidate: id.data });
  redirect("/candidates");
}

// ---------------------------------------------------------------- CSV import

const MAX_CSV_BYTES = 2_000_000;

export type CsvPreview = {
  status: "idle" | "preview" | "imported" | "error";
  message?: string;
  headers?: string[];
  mapping?: ColumnMapping;
  totalRows?: number;
  newRows?: number;
  duplicates?: number;
  needsReview?: number;
  issues?: RowIssue[];
  sample?: Pick<CandidateDraft, "full_name" | "profile_key" | "university" | "discipline" | "classificationNote">[];
};

const mappingFields = ["fullName", "profileUrl", "school", "program", "role", "degreeLevel", "gradYear", "notes"] as const;

function readMapping(formData: FormData): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const f of mappingFields) {
    const v = formData.get(`map.${f}`);
    if (typeof v === "string" && v !== "") mapping[f] = Number(v);
  }
  return mapping;
}

/** Dry run first (mode=preview), then the same input again with mode=import. */
export async function importCandidatesCsv(_: CsvPreview, formData: FormData): Promise<CsvPreview> {
  const file = formData.get("file");
  const csv = file instanceof File && file.size > 0 ? await file.text() : "";
  if (!csv.trim()) return { status: "error", message: "Choose a CSV file first." };
  if (csv.length > MAX_CSV_BYTES) return { status: "error", message: "The file is larger than 2 MB. Split it into smaller files." };

  const rows = parseCsv(csv);
  if (rows.length < 2) return { status: "error", message: "The file needs a header row and at least one data row." };
  const headers = rows[0].map((h) => h.trim());
  const mapping = formData.get("mapped") === "1" ? readMapping(formData) : detectMapping(headers);

  const ctx = await actionContext();
  const { drafts, issues, totalRows } = prepareCandidateRows(csv, mapping, {
    countUbcoAsUbc: ctx.settings.count_ubco_as_ubc,
    hasHeader: true,
  });

  // Find which profiles are already in the list (in chunks to keep URLs short).
  const existing = new Set<string>();
  const keys = drafts.map((d) => d.profile_key);
  for (let i = 0; i < keys.length; i += 200) {
    const { data, error } = await ctx.supabase.from("candidates").select("profile_key").in("profile_key", keys.slice(i, i + 200));
    if (error) return { status: "error", message: "Couldn't check for duplicates. Try again." };
    data.forEach((r) => existing.add(r.profile_key));
  }
  const fresh = drafts.filter((d) => !existing.has(d.profile_key));
  const summary = {
    headers,
    mapping,
    totalRows,
    newRows: fresh.length,
    duplicates: drafts.length - fresh.length,
    needsReview: fresh.filter((d) => d.university_confidence !== "confirmed" || d.discipline_confidence !== "confirmed").length,
    issues: issues.slice(0, 50),
    sample: fresh.slice(0, 8).map(({ full_name, profile_key, university, discipline, classificationNote }) => ({
      full_name,
      profile_key,
      university,
      discipline,
      classificationNote,
    })),
  };

  if (formData.get("mode") !== "import") return { status: "preview", ...summary };
  if (fresh.length === 0) return { status: "error", message: "Nothing new to import.", ...summary };

  const approve = formData.get("approveConfirmed") === "on";
  for (let i = 0; i < fresh.length; i += 500) {
    const chunk = fresh.slice(i, i + 500).map(({ classificationNote: _note, ...d }) => ({
      ...d,
      user_id: ctx.userId,
      source: "csv" as const,
      status:
        approve && d.university_confidence === "confirmed" && d.discipline_confidence === "confirmed"
          ? ("approved" as const)
          : ("awaiting_review" as const),
    }));
    // ignoreDuplicates makes a re-submitted import safe: existing profiles are left alone.
    const { error } = await ctx.supabase.from("candidates").upsert(chunk, { onConflict: "user_id,profile_key", ignoreDuplicates: true });
    if (error) {
      return { status: "error", message: `Imported ${i} rows, then failed. Re-run the import; rows already added are skipped.`, ...summary };
    }
  }

  await logActivity(ctx, "import.csv", { added: fresh.length, duplicates: summary.duplicates, invalid: issues.length });
  refresh();
  return {
    status: "imported",
    message: `Imported ${fresh.length} candidate${fresh.length === 1 ? "" : "s"}${summary.needsReview ? `; ${summary.needsReview} need review` : ""}.`,
    ...summary,
  };
}
