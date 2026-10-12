"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAIProvider } from "@/lib/ai";
import { HttpPageFetcher } from "@/lib/discovery/fetch-page";
import { err, ok, type ActionResult } from "@/lib/action-result";
import { failed, firstIssue, saved, type FormState } from "@/lib/form-state";
import { canStoreKeys, encryptSecret, validateOwnKey } from "@/lib/job-postings/ai";
import { adapterFor } from "@/lib/job-postings/ats";
import { detectFromCareersUrl } from "@/lib/job-postings/ats/detect";
import { ANYWHERE, countryName, isCountryCode } from "@/lib/geo/countries";
import { jobPlace, wantedScope } from "@/lib/job-postings/ats/types";
import { searchedCountries } from "@/lib/job-postings/crawler";
import { crawlDue } from "@/lib/job-postings/crawler";
import { jobDedupeKey, simhash64 } from "@/lib/job-postings/dedupe";
import { jobLevel, workplaceFromText } from "@/lib/job-postings/levels";
import { dedupeKey } from "@/lib/job-postings/normalize";
import { groundPastedFields, type PastedPosting } from "@/lib/job-postings/paste-parse";
import { loadActiveResume, saveRequirements, scoreJobs } from "@/lib/job-postings/service";
import { jobServices } from "@/lib/job-postings/services";
import { PROVINCE_CODES, SENIORITY } from "@/lib/job-postings/types";
import { checkUrlLive } from "@/lib/job-postings/verify-job";
import { checkUrlShape } from "@/lib/job-postings/verify-url";
import { actionContext, logActivity } from "@/lib/server/action-context";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Job search preferences, saved/applied state, pasted postings, the shared employer
 * directory and the user's own AI key. Resume edits live in resume/actions.ts, writing for
 * a job in [id]/actions.ts, and document edits in documents/actions.ts.
 */

export type { ActionResult } from "@/lib/action-result";
const uuid = z.uuid();

const list = (v: FormDataEntryValue | null, max: number) =>
  [...new Set((v?.toString() ?? "").split(/[\n,]/).map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean))].slice(0, max);

// ------------------------------------------------------------ preferences

const Preferences = z
  .object({
    titles: z.array(z.string().max(80, "Keep each title under 80 characters.")).max(6, "Use at most 6 titles."),
    country: z.string().refine((c) => c === ANYWHERE || isCountryCode(c), "Pick a country."),
    provinces: z.array(z.enum(PROVINCE_CODES)),
    seniority: z.enum(SENIORITY),
    exclude: z.array(z.string().max(40)).max(20),
  })
  .refine((p) => p.country !== "CA" || p.provinces.length > 0, { message: "Pick at least one province.", path: ["provinces"] });

export async function saveJobPreferences(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = Preferences.safeParse({
    titles: list(formData.get("titles"), 7),
    country: (formData.get("country")?.toString() || "CA").toUpperCase(),
    provinces: formData.getAll("provinces").map(String),
    seniority: formData.get("seniority"),
    exclude: list(formData.get("exclude"), 21),
  });
  if (!parsed.success) return failed(firstIssue(parsed.error));
  const ctx = await actionContext();
  const admin = createAdminClient();
  const before = await searchedCountries(admin);
  const { error } = await ctx.supabase
    .from("settings")
    .update({
      job_titles: parsed.data.titles,
      job_country: parsed.data.country,
      // Provinces only narrow a Canadian search; other countries keep the last Canadian choice.
      ...(parsed.data.provinces.length ? { job_provinces: parsed.data.provinces } : {}),
      job_seniority: parsed.data.seniority,
      job_exclude_keywords: parsed.data.exclude,
    })
    .eq("user_id", ctx.userId);
  if (error) return failed("Couldn't save. Try again.");
  // A country nobody searched before: employers' boards are read again from scratch (the
  // earlier reads kept only other countries' jobs), starting with the next crawl.
  const isNew = !before.includes(parsed.data.country);
  if (isNew) await admin.from("employers").update({ etag: null, next_crawl_at: new Date().toISOString() }).neq("status", "disabled");
  refresh();
  return saved(
    isNew
      ? `Saved. Employer boards are being read for ${countryName(parsed.data.country)}; their jobs appear within about 10 minutes. Remote job sites are searched right away.`
      : "Your job search preferences were saved.",
  );
}

// ------------------------------------------------------------ jobs

const STATUS_MESSAGE = { saved: "Job saved.", applied: "Application marked as applied.", dismissed: "Job hidden from your results." } as const;

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
  return ok(status ? STATUS_MESSAGE[status] : "Job removed from your list.");
}

export async function checkFit(jobId: string): Promise<ActionResult> {
  if (!uuid.safeParse(jobId).success) return err("Unknown job.");
  const ctx = await actionContext();
  const resume = await loadActiveResume(ctx.supabase);
  if (!resume) return err("Import your resume first.");
  await scoreJobs(ctx.supabase, ctx.userId, resume, [jobId], jobServices().embedder);
  refresh();
  return ok("Fit checked against your resume.");
}

const Manual = z.object({
  title: z.string().trim().min(2, "Add the job title.").max(300),
  company: z.string().trim().max(300),
  city: z.string().trim().max(120),
  country: z.string().refine((c) => isCountryCode(c), "Pick the job's country."),
  province: z.enum(PROVINCE_CODES).or(z.literal("")),
  url: z.url("Add the link to the posting.").refine((u) => /^https?:\/\//i.test(u), "Use an http(s) link.").max(2000),
  description: z.string().trim().min(100, "Paste the full posting (at least a few sentences).").max(60_000),
});

/**
 * "Read with AI" on a pasted job page: the AI suggests title, company and location, and
 * only values found word for word in the paste are kept. Uses one of the day's AI uses.
 * Nothing is saved; the user checks the form and adds the posting themselves.
 */
export async function readPastedPostingWithAI(text: string): Promise<ActionResult<Omit<PastedPosting, "description">>> {
  const page = typeof text === "string" ? text.slice(0, 60_000) : "";
  if (page.trim().length < 50) return err("Paste the job page first.");
  const ctx = await actionContext();
  const session = await getAIProvider(ctx.supabase, ctx.userId);
  if (!session.ok) return err(`${session.reason} The form was filled from the page without AI; check it before adding.`);
  if (!(await session.charge())) return err("You've used today's free AI uses. The form was filled from the page without AI; check it before adding.");
  const res = await session.provider.parsePosting(page);
  if (!res.ok) return err("AI couldn't read this page. The form was filled from the page without AI; check it before adding.");
  const fields = groundPastedFields(res.data, page);
  await logActivity(ctx, "jobs.posting_read_ai", { found: [fields.title, fields.company, fields.country].filter(Boolean).length });
  return ok("Read with AI. Check the form before adding.", { data: fields });
}

/**
 * A posting the user pasted, e.g. from LinkedIn. Private to them. Its link is the one they
 * gave; it's checked (shape, then a safe request) and the result is shown, never assumed.
 */
export async function addManualPosting(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = Manual.safeParse(Object.fromEntries(["title", "company", "city", "country", "province", "url", "description"].map((k) => [k, formData.get(k)?.toString() ?? ""])));
  if (!parsed.success) return failed(firstIssue(parsed.error));
  // A province only means something for a job in Canada.
  const m = { ...parsed.data, province: parsed.data.country === "CA" ? parsed.data.province : "" };
  const shape = checkUrlShape(m.url, { allowFixtureHosts: false });
  if (!shape.ok && shape.status === "failed_validation") return failed(`That link can't be used: ${shape.reason.toLowerCase()}. Paste the link to the posting itself.`);
  const ctx = await actionContext();
  const remote = !m.city && !m.province;
  const live = await checkUrlLive(m.url, { source: "manual" }, m.company || null, { jobTitle: m.title });
  const level = jobLevel(m.title, null);
  const { data, error } = await ctx.supabase
    .from("jobs")
    .upsert(
      {
        user_id: ctx.userId,
        source: "manual",
        external_id: dedupeKey({ title: m.title, company: m.company || null, city: m.city || null, province: m.province || null, remote }),
        title: m.title,
        company: m.company || null,
        city: m.city || null,
        province: m.province || null,
        country: m.country,
        countries: [m.country],
        location_text: [m.city, m.province, countryName(m.country)].filter(Boolean).join(", ") || null,
        remote,
        workplace_type: workplaceFromText(m.title, m.description.slice(0, 2000)) ?? (remote ? "remote" : null),
        experience_level: level.level,
        level_source: level.source,
        posted_at: new Date().toISOString(),
        apply_url: m.url,
        verification_status: live.status,
        verified_at: live.status === "verified" ? new Date().toISOString() : null,
        verification_note: live.note?.slice(0, 300) ?? null,
        final_url: live.finalUrl,
        canonical_url: shape.ok ? shape.canonical : null,
        description: m.description,
        dedupe_key: jobDedupeKey({ company: m.company || null, title: m.title, city: m.city || null, province: m.province || null, remote }),
        desc_fingerprint: simhash64(m.description),
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
  await logActivity(ctx, "jobs.posting_added", { job: data.id, link: live.status });
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

  const { data: prefs } = await ctx.supabase.from("settings").select("job_country").eq("user_id", ctx.userId).maybeSingle();
  const country = prefs?.job_country ?? "CA";
  let matching = 0;
  try {
    const r = await adapterFor(board.ats).fetchBoard(board.token, { signal: AbortSignal.timeout(20_000) });
    if (!r.notModified) matching = r.jobs.filter((j) => jobPlace(j.places, j.remote, wantedScope([country]))).length;
  } catch {
    return failed("That job board didn't answer. Check the link and try again.");
  }
  const { error } = await admin.from("employers").insert({ name, ats: board.ats, board_token: board.token, careers_url: url, added_by: ctx.userId, next_crawl_at: new Date().toISOString() });
  if (error) return failed("Couldn't add it. Try again.");
  await logActivity(ctx, "jobs.employer_added", { ats: board.ats });
  refresh();
  const where = countryName(country) ?? "your country";
  return saved(`Added. ${matching ? `${matching} job${matching === 1 ? "" : "s"} open to ${where} right now; ` : `No jobs open to ${where} right now; `}its board is read on the regular schedule.`);
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

// ------------------------------------------------------------ your AI key

export async function saveOwnAiKey(_: FormState, formData: FormData): Promise<FormState> {
  const key = formData.get("key")?.toString().trim() ?? "";
  if (!canStoreKeys()) return failed("This server can't store keys (APP_ENCRYPTION_KEY isn't set).");
  if (!(await validateOwnKey(key))) return failed("That key didn't work. Use a Gemini API key from Google AI Studio (starts with AIza) or an Anthropic key, and try again.");
  const ctx = await actionContext();
  const { error } = await ctx.supabase.from("user_ai").upsert({ user_id: ctx.userId, own_key_ciphertext: encryptSecret(key), own_key_hint: `…${key.slice(-4)}` }, { onConflict: "user_id" });
  if (error) return failed("Couldn't save. Try again.");
  await logActivity(ctx, "jobs.ai_key_saved");
  refresh();
  return saved("Saved. AI tailoring now uses your own key.");
}

export async function removeOwnAiKey(): Promise<ActionResult> {
  const ctx = await actionContext();
  const { error } = await ctx.supabase.from("user_ai").delete().eq("user_id", ctx.userId);
  if (error) return err("Couldn't remove it. Try again.");
  await logActivity(ctx, "jobs.ai_key_removed");
  refresh();
  return ok("Your AI key was removed.");
}
