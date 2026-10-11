import { z } from "zod";

/**
 * The structured resume. Ids are assigned by our code (never by a model) so tailored
 * bullets can cite the exact original lines they were written from.
 */
export const ResumeBullet = z.object({ id: z.string(), text: z.string() });
export type ResumeBullet = z.infer<typeof ResumeBullet>;

export const ResumeEntry = z.object({
  id: z.string(),
  /** Employer, school or project name. */
  organization: z.string(),
  /** Job title, degree or project role. */
  title: z.string().nullable(),
  start: z.string().nullable(),
  end: z.string().nullable(),
  location: z.string().nullable(),
  bullets: z.array(ResumeBullet),
});
export type ResumeEntry = z.infer<typeof ResumeEntry>;

export const ResumeProfile = z.object({
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  links: z.array(z.string()),
  summary: z.string().nullable(),
  experience: z.array(ResumeEntry),
  education: z.array(ResumeEntry),
  projects: z.array(ResumeEntry),
  skills: z.array(z.string()),
  certifications: z.array(z.string()),
});
export type ResumeProfile = z.infer<typeof ResumeProfile>;

export const WORK_AUTHORIZATION = ["citizen", "permanent_resident", "work_permit", "needs_sponsorship", "unknown"] as const;

/** What a resume usually doesn't say, entered by the user. */
export const ResumeFacts = z.object({
  workAuthorization: z.enum(WORK_AUTHORIZATION).default("unknown"),
  securityClearance: z.boolean().default(false),
  willingToRelocate: z.boolean().default(false),
  /** Overrides the years of experience counted from the resume's dates. */
  yearsOverride: z.number().min(0).max(50).nullable().default(null),
});
export type ResumeFacts = z.infer<typeof ResumeFacts>;

// ------------------------------------------------------------------ requirements

export const REQUIREMENT_CATEGORIES = ["skill", "years", "degree", "licence", "clearance", "authorization", "language", "location", "other"] as const;
export const DEGREE_LEVELS = ["diploma", "bachelor", "master", "phd"] as const;
export type DegreeLevel = (typeof DEGREE_LEVELS)[number];

export const Requirement = z.object({
  id: z.string(),
  text: z.string(),
  kind: z.enum(["must", "nice"]),
  category: z.enum(REQUIREMENT_CATEGORIES),
  years: z.number().min(0).max(30).nullable(),
  degreeLevel: z.enum(DEGREE_LEVELS).nullable(),
});
export type Requirement = z.infer<typeof Requirement>;

export const RequirementResult = z.object({
  requirementId: z.string(),
  status: z.enum(["met", "partial", "missing"]),
  /** Exact text from the resume that shows it; checked by the server. */
  quote: z.string().nullable(),
  note: z.string().nullable(),
});
export type RequirementResult = z.infer<typeof RequirementResult>;

// ------------------------------------------------------------------ places and levels

export const PROVINCE_CODES = ["BC", "ON", "AB", "QC", "MB", "SK", "NS", "NB", "NL", "PE", "YT", "NT", "NU"] as const;
export type ProvinceCode = (typeof PROVINCE_CODES)[number];

export const PROVINCE_NAMES: Record<ProvinceCode, string> = {
  BC: "British Columbia",
  ON: "Ontario",
  AB: "Alberta",
  QC: "Quebec",
  MB: "Manitoba",
  SK: "Saskatchewan",
  NS: "Nova Scotia",
  NB: "New Brunswick",
  NL: "Newfoundland and Labrador",
  PE: "Prince Edward Island",
  YT: "Yukon",
  NT: "Northwest Territories",
  NU: "Nunavut",
};

export const SENIORITY = ["intern", "new_grad", "junior", "intermediate", "senior"] as const;
export type Seniority = (typeof SENIORITY)[number];
export const SENIORITY_LABELS: Record<Seniority, string> = {
  intern: "Intern / co-op",
  new_grad: "New grad",
  junior: "Junior (1–2 years)",
  intermediate: "Intermediate (3–5 years)",
  senior: "Senior (5+ years)",
};
