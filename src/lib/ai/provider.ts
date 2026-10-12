import { z } from "zod";
import { SECTION_KEYS } from "@/lib/job-postings/documents";
import type { AiResume } from "@/lib/job-postings/resume";
import type { Requirement, RequirementResult, ResumeProfile } from "@/lib/job-postings/types";

/**
 * What the app asks of a language model, independent of the vendor. Every method returns
 * structured data checked against a schema; the caller then checks it against the resume
 * and the posting (grounding and the accuracy guard) before anything is shown or saved.
 *
 * The model never decides facts: it never supplies job listings or links, never sets a
 * match score (fit is computed by rules, so it stays explainable), and anything it writes
 * that the resume doesn't support is removed by the caller.
 */

export type AiResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export type TailorMode = "normal" | "apply_anyway";
export type DocumentFormat = "resume" | "cv";

/** What the model sees when writing for one job. */
export type JobContext = {
  profile: ResumeProfile;
  posting: { title: string; company: string | null; description: string };
  requirements: Requirement[];
  results: RequirementResult[];
  /** The posting's keywords, most important first (from job-analysis). */
  keywords: string[];
  mode: TailorMode;
};

const Bullets = z.array(z.object({ text: z.string(), sourceBulletIds: z.array(z.string()) }));
export const AiTailoredResumeSchema = z.object({
  summary: z.string().nullable(),
  skills: z.array(z.string()),
  experience: z.array(z.object({ sourceId: z.string(), bullets: Bullets })),
  projects: z.array(z.object({ sourceId: z.string(), bullets: Bullets })),
  sectionOrder: z.array(z.enum(SECTION_KEYS)),
});
export type AiTailoredResumeOut = z.infer<typeof AiTailoredResumeSchema>;

export const AiCoverLetterSchema = z.object({ greeting: z.string(), paragraphs: z.array(z.string()), closing: z.string() });
export type AiCoverLetterOut = z.infer<typeof AiCoverLetterSchema>;

export const AiJobAnalysisSchema = z.object({
  requiredSkills: z.array(z.string()),
  preferredSkills: z.array(z.string()),
  responsibilities: z.array(z.string()),
  requiredQualifications: z.array(z.string()),
  preferredQualifications: z.array(z.string()),
  /** Exact phrases from the posting an applicant-tracking system would look for. */
  keywords: z.array(z.string()),
});
export type AiJobAnalysisOut = z.infer<typeof AiJobAnalysisSchema>;

export const AiNotesSchema = z.object({
  notes: z.array(
    z.object({
      section: z.enum(["summary", "skills", "experience", "projects", "education", "other"]),
      priority: z.enum(["high", "medium", "optional"]),
      /** The bullet or entry id the note is about, from the resume shown; null for a whole section. */
      target: z.string().nullable(),
      recommendation: z.string(),
      why: z.string(),
    }),
  ),
});
export type AiNotesOut = z.infer<typeof AiNotesSchema>;

/** The fields of a job page the user pasted. Each must be copied from the paste; the caller drops any that aren't. */
export const AiPostingSchema = z.object({
  title: z.string().nullable(),
  company: z.string().nullable(),
  /** The location exactly as the page writes it ("Toronto, ON", "Remote - EMEA"). */
  location: z.string().nullable(),
});
export type AiPostingOut = z.infer<typeof AiPostingSchema>;

export interface AIProvider {
  /** For the UI: "Google Gemini". */
  readonly name: string;
  parseResume(text: string): Promise<AiResult<AiResume>>;
  extractJobRequirements(posting: { title: string; description: string }): Promise<AiResult<AiJobAnalysisOut>>;
  tailorResume(input: JobContext, feedback?: string): Promise<AiResult<AiTailoredResumeOut>>;
  tailorCV(input: JobContext, feedback?: string): Promise<AiResult<AiTailoredResumeOut>>;
  generateCoverLetter(input: JobContext, feedback?: string): Promise<AiResult<AiCoverLetterOut>>;
  /** Extra, bullet-specific advice on top of the rule-based notes (which it receives). */
  generateResumeImprovementNotes(input: JobContext & { ruleNotes: string }): Promise<AiResult<AiNotesOut>>;
  /** Title, company and location from a job page the user copied and pasted. */
  parsePosting(text: string): Promise<AiResult<AiPostingOut>>;
}
