import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { toVector, type Embedder } from "./embeddings";
import { scoreFit, type Applicant } from "./fit";
import { indexResume, matchFree, resumeLinesFrom, type ResumeLine, type SemanticHit } from "./match";
import { extractRequirements } from "./requirements";
import { highestDegree, resumeText, yearsOfExperience } from "./resume";
import { trackPattern } from "./tracks";
import { ResumeFacts, ResumeProfile, type Requirement, type RequirementResult } from "./types";

export type Db = SupabaseClient<Database>;

/** Fit is checked for at most this many unchecked jobs per page view (longer time ranges catch up over views). */
export const MAX_SCORED_PER_VIEW = 600;

// ------------------------------------------------------------------ resume

export type ActiveResume = {
  id: string;
  profile: ResumeProfile;
  rawText: string;
  facts: ResumeFacts;
  updatedAt: string;
  applicant: Applicant;
  text: string;
  lines: ResumeLine[];
};

export function toActiveResume(row: { id: string; profile: Json; raw_text: string; facts: Json; updated_at: string }): ActiveResume | null {
  const profile = ResumeProfile.safeParse(row.profile);
  if (!profile.success) return null;
  const facts = ResumeFacts.parse(row.facts ?? {});
  return {
    id: row.id,
    profile: profile.data,
    rawText: row.raw_text,
    facts,
    updatedAt: row.updated_at,
    applicant: { years: facts.yearsOverride ?? yearsOfExperience(profile.data), degree: highestDegree(profile.data), facts },
    text: resumeText(profile.data, row.raw_text),
    lines: resumeLinesFrom(profile.data),
  };
}

/**
 * The current resume of a track (`null` is the main resume, which the Jobs list and alerts use).
 * Pass `userId` when `db` isn't limited by row-level security (cron jobs).
 */
export async function loadActiveResume(db: Db, userId?: string, track: string | null = null): Promise<ActiveResume | null> {
  let query = db.from("resumes").select("id, profile, raw_text, facts, updated_at").eq("is_active", true);
  query = track === null ? query.is("track", null) : query.ilike("track", trackPattern(track));
  if (userId) query = query.eq("user_id", userId);
  const { data } = await query.maybeSingle();
  return data ? toActiveResume(data) : null;
}

/** The current resume of every track, main first. */
export async function loadTrackResumes(db: Db, userId?: string): Promise<{ track: string | null; resume: ActiveResume }[]> {
  let query = db.from("resumes").select("id, profile, raw_text, facts, updated_at, track").eq("is_active", true);
  if (userId) query = query.eq("user_id", userId);
  const { data } = await query;
  return (data ?? [])
    .flatMap((row) => {
      const resume = toActiveResume(row);
      return resume ? [{ track: row.track, resume }] : [];
    })
    .sort((a, b) => Number(a.track !== null) - Number(b.track !== null) || (a.track ?? "").localeCompare(b.track ?? ""));
}

/** The track the user picked for this job, or null (the main resume). */
export async function loadJobTrack(db: Db, jobId: string, userId?: string): Promise<string | null> {
  let query = db.from("job_track_choices").select("track").eq("job_id", jobId);
  if (userId) query = query.eq("user_id", userId);
  const { data } = await query.maybeSingle();
  return data?.track ?? null;
}

/** The resume to use for a job: the chosen track's current one, else the main resume. */
export async function loadResumeForJob(db: Db, jobId: string, userId?: string): Promise<ActiveResume | null> {
  const track = await loadJobTrack(db, jobId, userId);
  return (track !== null ? await loadActiveResume(db, userId, track) : null) ?? (await loadActiveResume(db, userId));
}

/** Stores the resume's lines, with embeddings when available, for matching. */
export async function saveResumeLines(db: Db, userId: string, resumeId: string, profile: ResumeProfile, embedder: Embedder): Promise<void> {
  const lines = resumeLinesFrom(profile);
  const vectors = embedder.enabled && lines.length ? await embedder.embed(lines.map((l) => l.text)) : null;
  await db.from("resume_lines").delete().eq("resume_id", resumeId);
  if (!lines.length) return;
  await db.from("resume_lines").insert(
    lines.map((l, i) => ({ resume_id: resumeId, user_id: userId, line_id: l.id, text: l.text, embedding: vectors ? toVector(vectors[i]) : null })),
  );
}

// ------------------------------------------------------------------ requirements

type RequirementRow = { job_id: string; idx: number; text: string; kind: string; category: string; years: number | null; degree_level: string | null };

export const toRequirement = (r: RequirementRow): Requirement => ({
  id: `r${r.idx + 1}`,
  text: r.text,
  kind: r.kind === "nice" ? "nice" : "must",
  category: (["skill", "years", "degree", "licence", "clearance", "authorization", "language", "location", "other"].includes(r.category) ? r.category : "other") as Requirement["category"],
  years: r.years,
  degreeLevel: (r.degree_level as Requirement["degreeLevel"]) ?? null,
});

/** Requirements for a pasted posting (shared jobs get theirs from the crawler). */
export async function saveRequirements(db: Db, jobId: string, description: string, embedder: Embedder): Promise<void> {
  const reqs = extractRequirements(description);
  await db.from("job_requirements").delete().eq("job_id", jobId);
  if (!reqs.length) return;
  const vectors = embedder.enabled ? await embedder.embed(reqs.map((r) => r.text)) : null;
  await db.from("job_requirements").insert(
    reqs.map((r, idx) => ({ job_id: jobId, idx, text: r.text, kind: r.kind, category: r.category, years: r.years, degree_level: r.degreeLevel, embedding: vectors ? toVector(vectors[idx]) : null })),
  );
}

// ------------------------------------------------------------------ fit

export type MatchRow = { job_id: string; id: string; fit_score: number; tier: Database["public"]["Enums"]["job_fit_tier"]; summary: string | null; method: string; updated_at: string };

/**
 * Checks jobs against the resume and saves the results: one query for requirements,
 * one for meaning-based matches, then rules in TypeScript. No outside calls.
 */
export async function scoreJobs(db: Db, userId: string, resume: ActiveResume, jobIds: string[], embedder: Embedder): Promise<Map<string, MatchRow>> {
  const out = new Map<string, MatchRow>();
  const chunks = chunk(jobIds.slice(0, MAX_SCORED_PER_VIEW), JOBS_PER_QUERY);
  for (let i = 0; i < chunks.length; i += PARALLEL_QUERIES) {
    const parts = await Promise.all(chunks.slice(i, i + PARALLEL_QUERIES).map((ids) => scoreChunk(db, userId, resume, ids, embedder)));
    for (const part of parts) for (const [id, m] of part) out.set(id, m);
  }
  return out;
}

/**
 * Jobs per query. The API returns at most 1,000 rows per request and a job has up to 25
 * requirements, so 35 jobs always fit; it also keeps id lists short enough for a URL.
 */
const JOBS_PER_QUERY = 35;
const PARALLEL_QUERIES = 4;

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function scoreChunk(db: Db, userId: string, resume: ActiveResume, ids: string[], embedder: Embedder): Promise<Map<string, MatchRow>> {
  const out = new Map<string, MatchRow>();
  if (!ids.length) return out;
  const [{ data: reqRows }, semantic] = await Promise.all([
    db.from("job_requirements").select("job_id, idx, text, kind, category, years, degree_level").in("job_id", ids).order("idx"),
    embedder.enabled ? db.rpc("match_jobs", { p_resume: resume.id, p_jobs: ids }) : Promise.resolve({ data: null }),
  ]);
  const reqsByJob = new Map<string, Requirement[]>();
  for (const r of reqRows ?? []) reqsByJob.set(r.job_id, [...(reqsByJob.get(r.job_id) ?? []), toRequirement(r)]);
  const hitsByJob = new Map<string, Map<string, SemanticHit>>();
  for (const h of semantic.data ?? []) {
    const m = hitsByJob.get(h.job_id) ?? new Map<string, SemanticHit>();
    m.set(`r${h.idx + 1}`, { lineId: h.line_id, similarity: h.similarity });
    hitsByJob.set(h.job_id, m);
  }

  const index = indexResume(resume.lines);
  const rows = ids.map((jobId) => {
    const reqs = reqsByJob.get(jobId) ?? [];
    const hits = hitsByJob.get(jobId) ?? null;
    const results = matchFree(reqs, index, hits, embedder.thresholds);
    const fit = scoreFit(reqs, results, resume.applicant);
    return {
      user_id: userId,
      job_id: jobId,
      resume_id: resume.id,
      fit_score: fit.score,
      tier: fit.tier,
      method: hits?.size ? "semantic" : "keywords",
      requirement_results: { requirements: reqs, results: fit.results } as unknown as NonNullable<Json>,
      exclusion_reasons: fit.exclusionReasons,
      summary: fit.summary,
    };
  });
  const { data } = await db.from("job_matches").upsert(rows, { onConflict: "user_id,job_id,resume_id" }).select("id, job_id, fit_score, tier, summary, method, updated_at");
  for (const m of data ?? []) out.set(m.job_id, m);
  return out;
}

export async function loadRequirements(db: Db, jobId: string): Promise<Requirement[]> {
  const { data } = await db.from("job_requirements").select("job_id, idx, text, kind, category, years, degree_level").eq("job_id", jobId).order("idx");
  return (data ?? []).map(toRequirement);
}

export type StoredResults = { requirements: Requirement[]; results: RequirementResult[] };
