import { z } from "zod";

/**
 * The tailored documents as stored, edited and rendered. Facts (employers, titles,
 * dates, schools) are copied from the parsed resume; only wording comes from the model.
 */

export const DocHeader = z.object({
  name: z.string().max(200).nullable(),
  email: z.string().max(200).nullable(),
  phone: z.string().max(60).nullable(),
  location: z.string().max(200).nullable(),
  links: z.array(z.string().max(300)).max(8),
});
export type DocHeader = z.infer<typeof DocHeader>;

export const DocBullet = z.object({ text: z.string().max(600), sourceBulletIds: z.array(z.string()).max(6) });

export const DocEntry = z.object({
  sourceId: z.string(),
  organization: z.string().max(300),
  title: z.string().max(300).nullable(),
  start: z.string().max(40).nullable(),
  end: z.string().max(40).nullable(),
  location: z.string().max(200).nullable(),
  bullets: z.array(DocBullet).max(15),
});
export type DocEntry = z.infer<typeof DocEntry>;

export const SECTION_KEYS = ["experience", "projects", "education"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];
export const SECTION_HEADINGS: Record<SectionKey, string> = { experience: "Experience", projects: "Projects", education: "Education" };

export const TailoredResumeDoc = z.object({
  header: DocHeader,
  summary: z.string().max(1200).nullable(),
  skills: z.array(z.string().max(80)).max(60),
  sections: z.array(z.object({ key: z.enum(SECTION_KEYS), entries: z.array(DocEntry).max(20) })).max(3),
  certifications: z.array(z.string().max(200)).max(20),
});
export type TailoredResumeDoc = z.infer<typeof TailoredResumeDoc>;

export const CoverLetterDoc = z.object({
  header: DocHeader,
  company: z.string().max(300).nullable(),
  jobTitle: z.string().max(300),
  greeting: z.string().max(200),
  paragraphs: z.array(z.string().max(2000)).min(1).max(8),
  closing: z.string().max(100),
  signature: z.string().max(200).nullable(),
});
export type CoverLetterDoc = z.infer<typeof CoverLetterDoc>;

/** What the server removed or replaced, shown to the user beside the document. */
export type GuardIssue = { where: string; text: string; reason: string; action: "replaced_with_original" | "removed" | "kept_original" };
