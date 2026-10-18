import type { DocEntry, TailoredResumeDoc } from "./documents";
import { headerFrom } from "./tailor-guard";
import type { ResumeEntry, ResumeProfile } from "./types";

/**
 * A resume profile as a document, word for word: nothing is rewritten, added or dropped. Used to download a base
 * resume (a track) as PDF or Word with the same layout as a tailored one.
 */

const entry = (e: ResumeEntry): DocEntry => ({
  sourceId: e.id,
  organization: e.organization,
  title: e.title,
  start: e.start,
  end: e.end,
  location: e.location,
  bullets: e.bullets.map((b) => ({ text: b.text, sourceBulletIds: [b.id] })),
});

export function profileToDoc(profile: ResumeProfile): TailoredResumeDoc {
  const sections: TailoredResumeDoc["sections"] = [
    { key: "experience" as const, entries: profile.experience.map(entry) },
    { key: "projects" as const, entries: profile.projects.map(entry) },
    { key: "education" as const, entries: profile.education.map(entry) },
    { key: "awards" as const, entries: (profile.awards ?? []).map(entry) },
    { key: "activities" as const, entries: (profile.activities ?? []).map(entry) },
  ].filter((s) => s.entries.length);
  return { header: headerFrom(profile), summary: profile.summary, skills: profile.skills.slice(0, 60), sections, certifications: profile.certifications.slice(0, 20) };
}
