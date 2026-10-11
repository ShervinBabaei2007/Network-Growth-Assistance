"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { HttpPageFetcher } from "@/lib/discovery/fetch-page";
import { failed, firstIssue, saved, type FormState } from "@/lib/form-state";
import { aiAccess, canStoreKeys, consumeQuota, encryptSecret, validateAnthropicKey } from "@/lib/job-postings/ai";
import { adapterFor } from "@/lib/job-postings/ats";
import { detectFromCareersUrl } from "@/lib/job-postings/ats/detect";
import { canadianPlace } from "@/lib/job-postings/ats/types";
import { crawlDue } from "@/lib/job-postings/crawler";
import { CoverLetterDoc, TailoredResumeDoc, type GuardIssue } from "@/lib/job-postings/documents";
import { dedupeKey } from "@/lib/job-postings/normalize";
import { StoredFit } from "@/lib/job-postings/schemas";
import { lineRelevance, loadActiveResume, saveRequirements, saveResumeLines, scoreJobs, type ActiveResume } from "@/lib/job-postings/service";
import { jobServices } from "@/lib/job-postings/services";
import { smartCoverLetter, smartTailorResume, type SmartInput } from "@/lib/job-postings/smart-tailor";
import { tailorCoverLetter, tailorResume, type TailorMode } from "@/lib/job-postings/tailor";
import { PROVINCE_CODES, ResumeFacts, ResumeProfile, SENIORITY, WORK_AUTHORIZATION } from "@/lib/job-postings/types";
import { actionContext, logActivity, type ActionContext } from "@/lib/server/action-context";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };
const ok = (message?: string): ActionResult => ({ ok: true, message });
const err = (error: string): ActionResult => ({ ok: false, error });
const uuid = z.uuid();
const asJson = (v: unknown) => v as NonNullable<Json>;

const list = (v: FormDataEntryValue | null, max: number) =>
  [...new Set((v?.toString() ?? "").split(/[\n,]/).map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean))].slice(0, max);

// ------------------------------------------------------------ preferences

const Preferences = z.object({
  titles: z.array(z.string().max(80, "Keep each title under 80 characters.")).max(6, "Use at most 6 titles."),
  provinces: z.array(z.enum(PROVINCE_CODES)).min(1, "Pick at least one province."),
  seniority: z.enum(SENIORITY),
  exclude: z.array(z.string().max(40)).max(20),
});

export async function saveJobPreferences(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = Preferences.safeParse({
    titles: list(formData.get("titles"), 7),
    provinces: formData.getAll("provinces").map(String),
    seniority: formData.get("seniority"),
    exclude: list(formData.get("exclude"), 21),
  });
  if (!parsed.success) return failed(firstIssue(parsed.error));
  const ctx = await actionContext();
  const { error } = await ctx.supabase
    .from("settings")
    .update({ job_titles: parsed.data.titles, job_provinces: parsed.data.provinces, job_seniority: parsed.data.seniority, job_exclude_keywords: parsed.data.exclude })
    .eq("user_id", ctx.userId);
  if (error) return failed("Couldn't save. Try again.");
  refresh();
  return saved("Saved.");
}

// ------------------------------------------------------------ resumes

const Facts = z.object({
  workAuthorization: z.enum(WORK_AUTHORIZATION),
  securityClearance: z.boolean(),
  willingToRelocate: z.boolean(),
  yearsOverride: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number({ error: "Years must be a number." }).min(0).max(50).nullable()),
});

export async function saveResumeFacts(_: FormState, formData: FormData): Promise<FormState> {
  const id = formData.get("resumeId")?.toString() ?? "";
  if (!uuid.safeParse(id).success) return failed("Unknown resume.");
  const parsed = Facts.safeParse({
    workAuthorization: formData.get("workAuthorization"),
    securityClearance: formData.get("securityClearance") === "on",
    willingToRelocate: formData.get("willingToRelocate") === "on",
    yearsOverride: formData.get("yearsOverride")?.toString().trim(),
  });
  if (!parsed.success) return failed(firstIssue(parsed.error));
  const ctx = await actionContext();
  const { error } = await ctx.supabase.from("resumes").update({ facts: asJson(ResumeFacts.parse(parsed.data)) }).eq("id", id);
  if (error) return failed("Couldn't save. Try again.");
  refresh();
  return saved("Saved. Fit checks update as you browse.");
}

export async function saveResumeProfile(resumeId: string, profile: unknown): Promise<ActionResult> {
  if (!uuid.safeParse(resumeId).success) return err("Unknown resume.");
  const parsed = ResumeProfile.safeParse(profile);
  if (!parsed.success) return err("Some fields aren't valid. Check them and try again.");
  const p = parsed.data;
  // Ids are ours: renumber so new lines get ids and none collide.
  const renumber = (entries: typeof p.experience, prefix: string) =>
    entries
      .filter((e) => e.organization.trim() || e.bullets.length)
      .map((e, i) => ({ ...e, id: `${prefix}${i + 1}`, bullets: e.bullets.filter((b) => b.text.trim()).map((b, j) => ({ id: `${prefix}${i + 1}b${j + 1}`, text: b.text.trim() })) }));
  const next: ResumeProfile = { ...p, experience: renumber(p.experience, "x"), projects: renumber(p.projects, "p"), education: renumber(p.education, "d") };
  if (JSON.stringify(next).length > 100_000) return err("That's too long for a resume.");
  const ctx = await actionContext();
  const { error } = await ctx.supabase.from("resumes").update({ profile: asJson(next) }).eq("id", resumeId);
  if (error) return err("Couldn't save. Try again.");
  await saveResumeLines(ctx.supabase, ctx.userId, resumeId, next, jobServices().embedder);
  refresh();
  return ok("Saved. Fit checks update as you browse.");
}

export async function setActiveResume(resumeId: string): Promise<ActionResult> {
  if (!uuid.safeParse(resumeId).success) return err("Unknown resume.");
  const ctx = await actionContext();
  await ctx.supabase.from("resumes").update({ is_active: false }).eq("is_active", true);
  const { error } = await ctx.supabase.from("resumes").update({ is_active: true }).eq("id", resumeId);
  if (error) return err("Couldn't switch. Try again.");
  refresh();
  return ok("This resume is now used for fit checks.");
}

export async function deleteResume(resumeId: string): Promise<ActionResult> {
  if (!uuid.safeParse(resumeId).success) return err("Unknown resume.");
  const ctx = await actionContext();
  const { error } = await ctx.supabase.from("resumes").delete().eq("id", resumeId);
  if (error) return err("Couldn't delete. Try again.");
  await logActivity(ctx, "jobs.resume_deleted", { resume: resumeId });
  refresh();
  return ok("Deleted, with its fit checks and tailored documents.");
}

// ------------------------------------------------------------ jobs

export async function setJobStatus(jobId: string, status: "saved" | "applied" | "dismissed" | null): Promise<ActionResult> {
  if (!uuid.safeParse(jobId).success || (status !== null && !["saved", "applied", "dismissed"].includes(status))) return err("Unknown job.");
  const ctx = await actionContext();
  const { error } =
    status === null
      ? await ctx.supabase.from("job_user_states").delete().eq("job_id", jobId)
      : await ctx.supabase
          .from("job_user_states")
          .upsert({ user_id: ctx.userId, job_id: jobId, status, applied_at: status === "applied" ? new Date().toISOString() : null }, { onConflict: "user_id,job_id" });
  if (error) return err("Couldn't update. Try again.");
  await logActivity(ctx, `jobs.${status ?? "restored"}`, { job: jobId });
  refresh();
  return ok(status === "applied" ? "Marked as applied." : status === "saved" ? "Saved." : status === "dismissed" ? "Hidden from your feed." : "Restored.");
}

export async function checkFit(jobId: string): Promise<ActionResult> {
  if (!uuid.safeParse(jobId).success) return err("Unknown job.");
  const ctx = await actionContext();
  const resume = await loadActiveResume(ctx.supabase);
  if (!resume) return err("Upload your resume first.");
  await scoreJobs(ctx.supabase, ctx.userId, resume, [jobId], jobServices().embedder);
  refresh();
  return ok("Checked.");
}

const Manual = z.object({
  title: z.string().trim().min(2, "Add the job title.").max(300),
  company: z.string().trim().max(300),
  city: z.string().trim().max(120),
  province: z.enum(PROVINCE_CODES).or(z.literal("")),
  url: z.url("Add the link to the posting.").refine((u) => /^https?:\/\//i.test(u), "Use an http(s) link.").max(2000),
  description: z.string().trim().min(100, "Paste the full posting (at least a few sentences).").max(60_000),
});

/** A posting the user pasted, e.g. from LinkedIn. Private to them; nothing is fetched. */
export async function addManualPosting(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = Manual.safeParse(Object.fromEntries(["title", "company", "city", "province", "url", "description"].map((k) => [k, formData.get(k)?.toString() ?? ""])));
  if (!parsed.success) return failed(firstIssue(parsed.error));
  const m = parsed.data;
  const ctx = await actionContext();
  const remote = !m.city && !m.province;
  const { data, error } = await ctx.supabase
    .from("jobs")
    .upsert(
      {
        user_id: ctx.userId,
        external_id: dedupeKey({ title: m.title, company: m.company || null, city: m.city || null, province: m.province || null, remote }),
        title: m.title,
        company: m.company || null,
        city: m.city || null,
        province: m.province || null,
        location_text: [m.city, m.province].filter(Boolean).join(", ") || null,
        remote,
        posted_at: new Date().toISOString(),
        apply_url: m.url,
        description: m.description,
      },
      { onConflict: "user_id,external_id" },
    )
    .select("id")
    .single();
  if (error || !data) return failed("Couldn't add it. Try again.");
  const services = jobServices();
  await ctx.supabase.from("job_user_states").upsert({ user_id: ctx.userId, job_id: data.id, status: "saved" }, { onConflict: "user_id,job_id" });
  await saveRequirements(ctx.supabase, data.id, m.description, services.embedder);
  const resume = await loadActiveResume(ctx.supabase);
  if (resume) await scoreJobs(ctx.supabase, ctx.userId, resume, [data.id], services.embedder);
  await logActivity(ctx, "jobs.posting_added", { job: data.id });
  redirect(`/jobs/${data.id}`);
}

// ------------------------------------------------------------ employers

const MAX_EMPLOYERS_PER_DAY = 20;

/**
 * Adds an employer to the shared directory from its careers page or board URL. The
 * board must answer before it's added, so the directory only holds working boards.
 */
export async function addEmployer(_: FormState, formData: FormData): Promise<FormState> {
  const url = formData.get("url")?.toString().trim() ?? "";
  const name = formData.get("name")?.toString().trim() ?? "";
  if (!/^https?:\/\/\S+$/i.test(url) || url.length > 500) return failed("Paste the employer's careers page or job board link.");
  if (name.length < 2 || name.length > 200) return failed("Add the employer's name.");
  const ctx = await actionContext();
  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await admin.from("employers").select("id", { count: "exact", head: true }).eq("added_by", ctx.userId).gte("created_at", since);
  if ((count ?? 0) >= MAX_EMPLOYERS_PER_DAY) return failed(`You can add ${MAX_EMPLOYERS_PER_DAY} employers a day.`);

  const board = await detectFromCareersUrl(url, new HttpPageFetcher());
  if (!board) return failed("Couldn't find a supported job board there. Supported: Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Recruitee.");
  const { data: existing } = await admin.from("employers").select("id, name").eq("ats", board.ats).eq("board_token", board.token).maybeSingle();
  if (existing) return saved(`${existing.name} is already in the directory.`);

  let canada = 0;
  try {
    const r = await adapterFor(board.ats).fetchBoard(board.token, { signal: AbortSignal.timeout(20_000) });
    if (!r.notModified) canada = r.jobs.filter((j) => canadianPlace(j.places, j.remote)).length;
  } catch {
    return failed("That job board didn't answer. Check the link and try again.");
  }
  const { error } = await admin.from("employers").insert({ name, ats: board.ats, board_token: board.token, careers_url: url, added_by: ctx.userId, next_crawl_at: new Date().toISOString() });
  if (error) return failed("Couldn't add it. Try again.");
  await logActivity(ctx, "jobs.employer_added", { ats: board.ats });
  refresh();
  return saved(`Added. ${canada ? `${canada} job${canada === 1 ? "" : "s"} in Canada right now; ` : "No jobs in Canada right now; "}its board is read on the regular schedule.`);
}

/**
 * Reads the boards that are due now. Anyone signed in may ask: only boards already due
 * are read, so asking more often never reads a board more often than the schedule.
 */
export async function crawlNow(): Promise<ActionResult> {
  const ctx = await actionContext();
  const services = jobServices();
  const s = await crawlDue(createAdminClient(), { deadline: Date.now() + 40_000, embedder: services.embedder, fixtures: services.fixtures, maxBoards: 40 });
  await logActivity(ctx, "jobs.crawl_now", { boards: s.boards, new: s.newJobs });
  refresh();
  return ok(s.boards ? `Read ${s.boards} board${s.boards === 1 ? "" : "s"}: ${s.newJobs} new job${s.newJobs === 1 ? "" : "s"}.` : "Every board is up to date.");
}

// ------------------------------------------------------------ tailoring

async function tailorContext(ctx: ActionContext, jobId: string, mode: TailorMode): Promise<{ ok: true; input: SmartInput; resume: ActiveResume; matchId: string } | { ok: false; error: string }> {
  const resume = await loadActiveResume(ctx.supabase);
  if (!resume) return { ok: false, error: "Upload your resume first." };
  const { data: job } = await ctx.supabase.from("jobs").select("id, title, company, description").eq("id", jobId).maybeSingle();
  if (!job) return { ok: false, error: "Unknown job." };
  const services = jobServices();
  let { data: match } = await ctx.supabase.from("job_matches").select("id, tier, requirement_results").eq("job_id", jobId).eq("resume_id", resume.id).maybeSingle();
  if (!match) {
    const m = (await scoreJobs(ctx.supabase, ctx.userId, resume, [jobId], services.embedder)).get(jobId);
    if (!m) return { ok: false, error: "Couldn't check this job. Try again." };
    ({ data: match } = await ctx.supabase.from("job_matches").select("id, tier, requirement_results").eq("id", m.id).single());
  }
  if (!match) return { ok: false, error: "Couldn't check this job. Try again." };
  // "Tailor anyway" is the only way to tailor for a job the resume doesn't meet.
  if (match.tier === "excluded" && mode !== "apply_anyway") return { ok: false, error: "Your resume doesn't meet this job's requirements. Use “Tailor anyway” to apply regardless." };
  const fit = StoredFit.safeParse(match.requirement_results);
  return {
    ok: true,
    resume,
    matchId: match.id,
    input: {
      profile: resume.profile,
      resumeText: resume.text,
      years: resume.applicant.years,
      posting: { title: job.title, company: job.company, description: job.description },
      requirements: fit.success ? fit.data.requirements : [],
      results: fit.success ? fit.data.results : [],
      relevance: await lineRelevance(ctx.supabase, resume.id, jobId, services.embedder),
      mode,
    },
  };
}

async function saveDocs(ctx: ActionContext, matchId: string, mode: TailorMode, method: "smart" | "ai", docs: { kind: "resume" | "cover_letter"; generated: unknown; issues: GuardIssue[] }[]) {
  return ctx.supabase.from("tailored_documents").upsert(
    docs.map((d) => ({ user_id: ctx.userId, match_id: matchId, kind: d.kind, mode, method, generated: asJson(d.generated), guard_report: asJson(d.issues), edited: null })),
    { onConflict: "user_id,match_id,kind" },
  );
}

/** Free tailoring: the person's own lines, chosen and ordered for this job, plus a template letter. */
export async function tailorFree(jobId: string, mode: TailorMode): Promise<ActionResult> {
  if (!uuid.safeParse(jobId).success || (mode !== "normal" && mode !== "apply_anyway")) return err("Unknown job.");
  const ctx = await actionContext();
  const c = await tailorContext(ctx, jobId, mode);
  if (!c.ok) return err(c.error);
  const resume = smartTailorResume(c.input);
  const letter = smartCoverLetter(c.input);
  const { error } = await saveDocs(ctx, c.matchId, mode, "smart", [
    { kind: "resume", generated: resume.doc, issues: resume.issues },
    { kind: "cover_letter", generated: letter.doc, issues: letter.issues },
  ]);
  if (error) return err("Couldn't save the documents. Try again.");
  await logActivity(ctx, "jobs.tailored", { job: jobId, mode, method: "smart" });
  refresh();
  return ok("Done. Read them through and make them yours.");
}

/** Optional: AI rewording, with the user's own key or the operator's daily quota. */
export async function tailorWithAI(jobId: string, mode: TailorMode): Promise<ActionResult> {
  if (!uuid.safeParse(jobId).success || (mode !== "normal" && mode !== "apply_anyway")) return err("Unknown job.");
  const ctx = await actionContext();
  const access = await aiAccess(ctx.supabase);
  if (!access.ok) return err(access.reason);
  const c = await tailorContext(ctx, jobId, mode);
  if (!c.ok) return err(c.error);
  if (access.source === "operator" && !(await consumeQuota(ctx.userId))) return err("You've used today's AI rewrites. Add your own key in Settings, or use the free tailoring.");
  const input = { profile: c.input.profile, resumeText: c.input.resumeText, posting: c.input.posting, requirements: c.input.requirements, results: c.input.results, mode };
  const [res, letter] = await Promise.all([tailorResume(access.llm, input), tailorCoverLetter(access.llm, input)]);
  if (!res.ok && !letter.ok) return err(`AI couldn't write the documents: ${res.error}`);
  const docs = [
    res.ok ? { kind: "resume" as const, generated: res.doc, issues: res.issues } : null,
    letter.ok ? { kind: "cover_letter" as const, generated: letter.doc, issues: letter.issues } : null,
  ].filter((d) => d !== null);
  const { error } = await saveDocs(ctx, c.matchId, mode, "ai", docs);
  if (error) return err("Couldn't save the documents. Try again.");
  await logActivity(ctx, "jobs.tailored", { job: jobId, mode, method: "ai", key: access.source });
  refresh();
  return ok(!res.ok ? "The cover letter is done; the resume failed, try again." : !letter.ok ? "The resume is done; the cover letter failed, try again." : "Done.");
}

export async function saveDocumentEdit(docId: string, content: unknown): Promise<ActionResult> {
  if (!uuid.safeParse(docId).success) return err("Unknown document.");
  const ctx = await actionContext();
  const { data: doc } = await ctx.supabase.from("tailored_documents").select("kind").eq("id", docId).maybeSingle();
  if (!doc) return err("Unknown document.");
  // Edits are the user's own words, so only their shape is checked, not their content.
  const parsed = doc.kind === "resume" ? TailoredResumeDoc.safeParse(content) : CoverLetterDoc.safeParse(content);
  if (!parsed.success) return err("Something in the edit is too long or empty. Check it and try again.");
  const { error } = await ctx.supabase.from("tailored_documents").update({ edited: asJson(parsed.data) }).eq("id", docId);
  if (error) return err("Couldn't save. Try again.");
  refresh();
  return ok("Saved your edits.");
}

export async function discardDocumentEdit(docId: string): Promise<ActionResult> {
  if (!uuid.safeParse(docId).success) return err("Unknown document.");
  const ctx = await actionContext();
  const { error } = await ctx.supabase.from("tailored_documents").update({ edited: null }).eq("id", docId);
  if (error) return err("Couldn't reset. Try again.");
  refresh();
  return ok("Back to the generated version.");
}

// ------------------------------------------------------------ your AI key

export async function saveOwnAiKey(_: FormState, formData: FormData): Promise<FormState> {
  const key = formData.get("key")?.toString().trim() ?? "";
  if (!canStoreKeys()) return failed("This server can't store keys (APP_ENCRYPTION_KEY isn't set).");
  if (!(await validateAnthropicKey(key))) return failed("That key didn't work. Check it and try again.");
  const ctx = await actionContext();
  const { error } = await ctx.supabase.from("user_ai").upsert({ user_id: ctx.userId, own_key_ciphertext: encryptSecret(key), own_key_hint: `…${key.slice(-4)}` }, { onConflict: "user_id" });
  if (error) return failed("Couldn't save. Try again.");
  await logActivity(ctx, "jobs.ai_key_saved");
  refresh();
  return saved("Saved. AI rewriting now uses your key.");
}

export async function removeOwnAiKey(): Promise<ActionResult> {
  const ctx = await actionContext();
  const { error } = await ctx.supabase.from("user_ai").delete().eq("user_id", ctx.userId);
  if (error) return err("Couldn't remove it. Try again.");
  await logActivity(ctx, "jobs.ai_key_removed");
  refresh();
  return ok("Removed.");
}
