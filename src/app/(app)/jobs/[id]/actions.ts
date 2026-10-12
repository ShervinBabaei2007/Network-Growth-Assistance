"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getAIProvider, type AIProvider } from "@/lib/ai";
import type { DocumentFormat, JobContext } from "@/lib/ai/provider";
import { err, ok, type ActionResult } from "@/lib/action-result";
import { compareTailoring } from "@/lib/job-postings/compare";
import { buildImprovementNotes, mergeAiNotes, notesForPrompt, type NotesReport } from "@/lib/job-postings/improvement-notes";
import { analyzeJob, groundJobAnalysis, type JobAnalysis } from "@/lib/job-postings/job-analysis";
import { StoredFit } from "@/lib/job-postings/schemas";
import { loadActiveResume, scoreJobs, type ActiveResume } from "@/lib/job-postings/service";
import { jobServices } from "@/lib/job-postings/services";
import { smartCoverLetter } from "@/lib/job-postings/smart-tailor";
import { isMode, tailorDocument, writeCoverLetter, type TailorMode } from "@/lib/job-postings/tailor";
import { actionContext, logActivity, type ActionContext } from "@/lib/server/action-context";
import type { Json } from "@/lib/supabase/database.types";
import { plural, toastSpec } from "@/lib/toast";

/**
 * Writing for one job: a tailored resume or CV (AI only), a cover letter (AI, or a template
 * that says it's one) and Improvement Notes (always available, never change the resume).
 *
 * None of these actions writes to the resume. When AI tailoring isn't possible (no key,
 * today's free uses spent, the AI failed, or it couldn't rewrite meaningfully without
 * inventing details), no document is created: Improvement Notes are made instead and the
 * user is told exactly why.
 */

const uuid = z.uuid();
const asJson = (v: unknown) => v as NonNullable<Json>;

export type FallbackReason = "no_key" | "quota_exhausted" | "ai_failed" | "not_material";
export type WorkResult = ActionResult<{ fallback?: "notes"; reason?: FallbackReason; notesId?: string; docId?: string }>;

type WorkContext = {
  resume: ActiveResume;
  job: { id: string; title: string; company: string | null; description: string };
  matchId: string;
  tier: string;
  stored: StoredFit;
  analysis: JobAnalysis;
};

async function workContext(ctx: ActionContext, jobId: string): Promise<{ ok: true; c: WorkContext } | { ok: false; error: string }> {
  const resume = await loadActiveResume(ctx.supabase);
  if (!resume) return { ok: false, error: "Import your resume first." };
  const { data: job } = await ctx.supabase.from("jobs").select("id, title, company, description").eq("id", jobId).maybeSingle();
  if (!job) return { ok: false, error: "Unknown job." };
  let { data: match } = await ctx.supabase.from("job_matches").select("id, tier, requirement_results, updated_at").eq("job_id", jobId).eq("resume_id", resume.id).maybeSingle();
  if (!match || Date.parse(match.updated_at) < Date.parse(resume.updatedAt)) {
    const m = (await scoreJobs(ctx.supabase, ctx.userId, resume, [jobId], jobServices().embedder)).get(jobId);
    if (!m) return { ok: false, error: "Couldn't check this job against your resume. Try again." };
    ({ data: match } = await ctx.supabase.from("job_matches").select("id, tier, requirement_results, updated_at").eq("id", m.id).single());
  }
  if (!match) return { ok: false, error: "Couldn't check this job against your resume. Try again." };
  const stored = StoredFit.catch({ requirements: [], results: [] }).parse(match.requirement_results);
  return { ok: true, c: { resume, job, matchId: match.id, tier: match.tier, stored, analysis: analyzeJob(job, stored.requirements) } };
}

const jobContext = (c: WorkContext, mode: TailorMode): JobContext & { resumeText: string } => ({
  profile: c.resume.profile,
  posting: { title: c.job.title, company: c.job.company, description: c.job.description },
  requirements: c.stored.requirements,
  results: c.stored.results,
  keywords: c.analysis.atsKeywords.slice(0, 15).map((k) => k.term),
  mode,
  resumeText: c.resume.text,
});

/** Refines the rule-based reading of the posting with AI, keeping only what the posting says. */
async function refineAnalysis(ai: AIProvider, c: WorkContext): Promise<JobAnalysis> {
  const r = await ai.extractJobRequirements({ title: c.job.title, description: c.job.description });
  return r.ok ? groundJobAnalysis(c.analysis, r.data, c.job.description) : c.analysis;
}

/** Makes and stores Improvement Notes. Reads the resume; writes only to improvement_notes. */
async function createNotes(ctx: ActionContext, c: WorkContext, opts: { reason: "requested" | FallbackReason; ai?: AIProvider | null }): Promise<{ id: string; report: NotesReport } | null> {
  const posting = { title: c.job.title, company: c.job.company, description: c.job.description };
  let report = buildImprovementNotes({ profile: c.resume.profile, analysis: c.analysis, requirements: c.stored.requirements, results: c.stored.results, applicant: c.resume.applicant, posting });
  if (opts.ai) {
    const r = await opts.ai.generateResumeImprovementNotes({ ...jobContext(c, "normal"), ruleNotes: notesForPrompt(report) });
    if (r.ok) report = mergeAiNotes(report, r.data, c.resume.profile, c.resume.text, c.job.description).report;
  }
  const { data, error } = await ctx.supabase
    .from("improvement_notes")
    .insert({ user_id: ctx.userId, match_id: c.matchId, resume_id: c.resume.id, resume_updated_at: c.resume.updatedAt, method: report.method, reason: opts.reason, report: asJson(report) })
    .select("id")
    .single();
  return error || !data ? null : { id: data.id, report };
}

const FALLBACK_TOAST: Record<FallbackReason, { title: string; description: string }> = {
  no_key: {
    title: "AI tailoring isn't available. We haven't modified your resume.",
    description: "Instead, we've generated personalized improvement notes showing exactly how you can better align it with this job.",
  },
  quota_exhausted: {
    title: "Your free AI tailoring limit has been reached for today. We haven't modified your resume.",
    description: "Instead, we've generated personalized improvement notes showing exactly how you can better align it with this job.",
  },
  ai_failed: { title: "We couldn't tailor your resume. Your original resume was not changed.", description: "Here are improvement notes you can apply yourself instead." },
  not_material: {
    title: "We couldn't produce a meaningful rewrite without inventing details. Your original resume was not changed.",
    description: "Here are improvement notes showing what you could change yourself.",
  },
};

async function fallBackToNotes(ctx: ActionContext, c: WorkContext, reason: FallbackReason, what: string): Promise<WorkResult> {
  const notes = await createNotes(ctx, c, { reason });
  await logActivity(ctx, "jobs.tailor_fallback", { job: c.job.id, reason, what });
  refresh();
  const t = FALLBACK_TOAST[reason];
  return err(t.title, { toast: toastSpec("warning", t.title, t.description, "tailor"), data: { fallback: "notes", reason, notesId: notes?.id } });
}

/**
 * "Tailor Resume" / "Tailor CV": AI rewriting for this job, checked line by line against the
 * resume. Saves a new version; earlier versions and the resume itself are untouched.
 */
export async function tailorForJob(jobId: string, mode: TailorMode, format: DocumentFormat): Promise<WorkResult> {
  if (!uuid.safeParse(jobId).success || !isMode(mode) || (format !== "resume" && format !== "cv")) return err("Unknown job.");
  const ctx = await actionContext();
  const w = await workContext(ctx, jobId);
  if (!w.ok) return err(w.error);
  const c = w.c;
  if (c.tier === "excluded" && mode !== "apply_anyway") return err("Your resume doesn't meet this job's requirements. Use “Tailor anyway” to apply regardless.");
  const what = format === "cv" ? "CV" : "resume";

  const session = await getAIProvider(ctx.supabase, ctx.userId);
  if (!session.ok) return fallBackToNotes(ctx, c, session.code, what);
  if (!(await session.charge())) return fallBackToNotes(ctx, c, "quota_exhausted", what);

  c.analysis = await refineAnalysis(session.provider, c);
  const outcome = await tailorDocument(session.provider, { ...jobContext(c, mode), format });
  if (!outcome.ok) return fallBackToNotes(ctx, c, outcome.reason === "not_material" ? "not_material" : "ai_failed", what);

  const comparison = compareTailoring({
    profile: c.resume.profile,
    doc: outcome.doc,
    analysis: c.analysis,
    requirements: c.stored.requirements,
    applicant: c.resume.applicant,
    postingText: c.job.description,
    materiality: outcome.materiality,
  });
  const label = `Tailored ${format === "cv" ? "CV" : "Resume"} — ${[c.job.company, c.job.title].filter(Boolean).join(" / ")}`.slice(0, 200);
  const { data, error } = await ctx.supabase
    .from("tailored_documents")
    .insert({
      user_id: ctx.userId,
      match_id: c.matchId,
      kind: format,
      mode,
      method: "ai",
      label,
      generated: asJson(outcome.doc),
      guard_report: asJson(outcome.issues),
      comparison: asJson(comparison),
      resume_id: c.resume.id,
      resume_updated_at: c.resume.updatedAt,
    })
    .select("id")
    .single();
  if (error || !data) return err(`We couldn't save your tailored ${what}. Your original resume was not changed.`);
  await logActivity(ctx, "jobs.tailored", { job: jobId, mode, method: "ai", format, key: session.source });
  refresh();

  const missing = comparison.missingRequirements.length;
  const improved = comparison.keywordMatch.after > comparison.keywordMatch.before;
  const title = `Your tailored ${what} is ready.`;
  const toast = missing
    ? toastSpec("warning", `Your ${what} was tailored, but ${plural(missing, "job requirement")} ${missing === 1 ? "was" : "were"} not found in your experience.`, improved ? `Keyword match improved from ${comparison.keywordMatch.before}% to ${comparison.keywordMatch.after}%.` : undefined, "tailor")
    : toastSpec("success", title, improved ? `Match improved from ${comparison.keywordMatch.before}% to ${comparison.keywordMatch.after}%.` : undefined, "tailor");
  return ok(title, { toast, data: { docId: data.id } });
}

/**
 * A cover letter for this job: written by AI when it's available and asked for, otherwise a
 * template filled from the resume, labelled as a template. Each one is a new version.
 */
export async function generateCoverLetter(jobId: string, mode: TailorMode, useAi: boolean): Promise<WorkResult> {
  if (!uuid.safeParse(jobId).success || !isMode(mode)) return err("Unknown job.");
  const ctx = await actionContext();
  const w = await workContext(ctx, jobId);
  if (!w.ok) return err(w.error);
  const c = w.c;
  if (c.tier === "excluded" && mode !== "apply_anyway") return err("Your resume doesn't meet this job's requirements. Use “Tailor anyway” to apply regardless.");

  let doc: unknown;
  let issues: unknown;
  let method: "ai" | "template" = "template";
  if (useAi) {
    const session = await getAIProvider(ctx.supabase, ctx.userId);
    if (!session.ok) return err(session.reason, { toast: toastSpec("warning", "AI isn't available for cover letters right now.", `${session.reason} You can generate a template letter instead.`) });
    if (!(await session.charge())) return err("You've used today's free AI uses.", { toast: toastSpec("warning", "Your free AI limit has been reached for today.", "Generate a template letter instead, or add your own key in Settings.") });
    const r = await writeCoverLetter(session.provider, jobContext(c, mode));
    if (!r.ok) return err("We couldn't write the cover letter. Try again, or generate a template letter.");
    doc = r.doc;
    issues = r.issues;
    method = "ai";
  } else {
    const r = smartCoverLetter({ ...jobContext(c, mode), years: c.resume.applicant.years, relevance: new Map() });
    doc = r.doc;
    issues = r.issues;
  }
  const { data, error } = await ctx.supabase
    .from("tailored_documents")
    .insert({
      user_id: ctx.userId,
      match_id: c.matchId,
      kind: "cover_letter",
      mode,
      method,
      label: `Cover letter — ${[c.job.company, c.job.title].filter(Boolean).join(" / ")}`.slice(0, 200),
      generated: asJson(doc),
      guard_report: asJson(issues),
      resume_id: c.resume.id,
      resume_updated_at: c.resume.updatedAt,
    })
    .select("id")
    .single();
  if (error || !data) return err("Couldn't save the cover letter. Try again.");
  await logActivity(ctx, "jobs.cover_letter", { job: jobId, method });
  refresh();
  return ok(method === "ai" ? "Your cover letter is ready." : "A template cover letter is ready. Make it sound like you before sending.", { data: { docId: data.id } });
}

/** "Get Resume Improvement Notes": advice only. The resume isn't changed. */
export async function getImprovementNotes(jobId: string, useAi: boolean): Promise<WorkResult> {
  if (!uuid.safeParse(jobId).success) return err("Unknown job.");
  const ctx = await actionContext();
  const w = await workContext(ctx, jobId);
  if (!w.ok) return err(w.error);
  const c = w.c;
  let ai: AIProvider | null = null;
  let aiNote: string | undefined;
  if (useAi) {
    const session = await getAIProvider(ctx.supabase, ctx.userId);
    if (session.ok && (await session.charge())) {
      ai = session.provider;
      c.analysis = await refineAnalysis(ai, c);
    } else aiNote = "AI wasn't available, so these notes come from the built-in analysis.";
  }
  const notes = await createNotes(ctx, c, { reason: "requested", ai });
  if (!notes) return err("We couldn't generate improvement notes. Your resume was not changed.");
  await logActivity(ctx, "jobs.improvement_notes", { job: jobId, method: notes.report.method });
  refresh();
  const { counts, strongMatch } = notes.report;
  const title = strongMatch
    ? `Your resume is already a strong match. We found ${plural(counts.optional, "optional improvement")}.`
    : `${plural(counts.total, "resume improvement suggestion")} found.`;
  return ok(title, { toast: toastSpec(strongMatch ? "success" : "info", title, aiNote, "notes"), data: { notesId: notes.id } });
}

/** Hides one note (or brings it back). The notes stay advice; nothing else changes. */
export async function setNoteDismissed(notesId: string, noteId: string, dismissed: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(notesId).success || !/^[an]\d{1,3}$/.test(noteId)) return err("Unknown note.");
  const ctx = await actionContext();
  const { data } = await ctx.supabase.from("improvement_notes").select("dismissed").eq("id", notesId).maybeSingle();
  if (!data) return err("Unknown note.");
  const next = dismissed ? [...new Set([...data.dismissed, noteId])] : data.dismissed.filter((d) => d !== noteId);
  const { error } = await ctx.supabase.from("improvement_notes").update({ dismissed: next }).eq("id", notesId);
  if (error) return err("Couldn't update. Try again.");
  refresh();
  return ok(dismissed ? "Suggestion dismissed." : "Suggestion restored.");
}
