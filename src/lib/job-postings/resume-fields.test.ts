import { describe, expect, it } from "vitest";
import { clean } from "@/lib/text/match";
import { confirmFields, importSummary, parseResumeDetailed, reconcileWithAi } from "./resume-fields";
import { ResumeProfile } from "./types";

const CLEAR = `Sam Lee
Burnaby, BC | sam@example.com | 604-555-0101 | linkedin.com/in/samlee | github.com/samlee | samlee.dev
SUMMARY
Developer who builds reliable web apps.
EXPERIENCE
Acme Corp | Software Developer Co-op    May 2024 – Dec 2024
• Built REST endpoints in Python and Flask serving 2,000 daily users
PROJECTS
Course Planner
• React app for planning courses, deployed with Docker
EDUCATION
British Columbia Institute of Technology    Sep 2023 – Jun 2025
Diploma, Computer Systems Technology
SKILLS
Languages: Python, JavaScript, SQL
Frameworks: Flask, React
AWARDS
Dean's List
EXTRACURRICULAR ACTIVITIES
Robotics Club | Software Lead    Sep 2023 – Apr 2024
• Wrote the drive controller in C++`;

/** Every filled scalar value must be found in the resume text: nothing is invented. */
function expectNothingInvented(text: string, p: ResumeProfile) {
  const haystack = clean(text);
  const scalars = [p.name, p.email, p.phone, p.location, p.contact.linkedin, p.contact.github, p.contact.website, p.summary];
  const entryFields = [...p.experience, ...p.education, ...p.projects, ...p.awards, ...p.activities].flatMap((e) => [e.organization, e.title, e.degree, e.major, e.graduation?.replace(/^Expected /, "")]);
  for (const v of [...scalars, ...entryFields, ...p.skills]) {
    if (v) expect(haystack, `"${v}" isn't in the resume`).toContain(clean(v));
  }
}

describe("parseResumeDetailed: a clear resume", () => {
  const { profile: p, meta } = parseResumeDetailed(CLEAR);

  it("fills contact fields and separates the links", () => {
    expect(p).toMatchObject({ name: "Sam Lee", email: "sam@example.com", phone: "604-555-0101", location: "Burnaby, BC" });
    expect(p.contact).toEqual({ linkedin: "linkedin.com/in/samlee", github: "github.com/samlee", website: "samlee.dev" });
    for (const f of ["name", "email", "phone", "location", "contact.linkedin", "contact.github", "contact.website"]) expect(meta[f], f).toMatchObject({ needsReview: false });
  });

  it("reads degree, major and graduation from education", () => {
    expect(p.education[0]).toMatchObject({ organization: "British Columbia Institute of Technology", degree: "Diploma", major: "Computer Systems Technology", graduation: "Jun 2025" });
    expect(meta[`education.${p.education[0].id}.graduation`].needsReview).toBe(false);
  });

  it("reads awards and extracurricular activities", () => {
    expect(p.awards.map((a) => a.organization)).toEqual(["Dean's List"]);
    expect(p.activities[0]).toMatchObject({ organization: "Robotics Club", title: "Software Lead" });
  });

  it("has nothing to review and reports a complete profile", () => {
    const s = importSummary(p, meta);
    expect(s.needsReview).toEqual([]);
    expect(s.missing).toEqual([]);
    expect(s.completeness).toBe(100);
    // 11 profile fields (no certifications), 3 for the job, 4 for the school, 2 for the project.
    expect(s.filled).toBe(20);
  });

  it("invents nothing", () => expectNothingInvented(CLEAR, p));
});

describe("parseResumeDetailed: missing and uncertain fields", () => {
  it("leaves a missing LinkedIn empty and says it wasn't found", () => {
    const text = CLEAR.replace(" | linkedin.com/in/samlee", "");
    const { profile, meta } = parseResumeDetailed(text);
    expect(profile.contact.linkedin).toBeNull();
    expect(meta["contact.linkedin"]).toMatchObject({ missing: true, reason: "Not found in your resume." });
    expect(importSummary(profile, meta).missing).toContain("contact.linkedin");
  });

  it("flags a graduation date when the education section has several possible dates", () => {
    const text = `Sam Lee
sam@example.com
EDUCATION
University of Waterloo
Bachelor of Applied Science in Computer Engineering    2027
• Dean's List 2024`;
    const { profile, meta } = parseResumeDetailed(text);
    const e = profile.education[0];
    expect(e).toMatchObject({ degree: "Bachelor of Applied Science", major: "Computer Engineering", graduation: "2027" });
    const g = meta[`education.${e.id}.graduation`];
    expect(g.needsReview).toBe(true);
    expect(g.confidence).toBeLessThan(0.8);
    expect(g.confidence).toBeGreaterThanOrEqual(0.5);
    expect(g.alternatives).toContain("2024");
    expect(g.reason).toMatch(/multiple possible dates|couldn't tell/i);
    expectNothingInvented(text, profile);
  });

  it("treats “Expected 2027” as a graduation date without flagging it", () => {
    const { profile, meta } = parseResumeDetailed(`Sam Lee\nEDUCATION\nSimon Fraser University    Expected Apr 2027\nBachelor of Science in Computing Science`);
    const e = profile.education[0];
    expect(e.graduation).toBe("Expected Apr 2027");
    expect(meta[`education.${e.id}.graduation`].needsReview).toBe(false);
  });

  it("doesn't guess a graduation date for ongoing studies", () => {
    const { profile, meta } = parseResumeDetailed(`Sam Lee\nEDUCATION\nBCIT    Sep 2024 – Present\nDiploma, Computer Systems Technology`);
    const e = profile.education[0];
    expect(e.graduation).toBeNull();
    expect(meta[`education.${e.id}.graduation`]).toMatchObject({ missing: true });
  });

  it("flags two email addresses instead of silently picking one", () => {
    const { profile, meta } = parseResumeDetailed(CLEAR.replace("sam@example.com", "sam@example.com | sam.lee@school.ca"));
    expect(profile.email).toBe("sam@example.com");
    expect(meta.email).toMatchObject({ needsReview: true, alternatives: ["sam.lee@school.ca"] });
  });

  it("doesn't fill a name it isn't sure of, but offers it", () => {
    const { profile, meta } = parseResumeDetailed(CLEAR.replace("Sam Lee\n", "sam lee - aspiring developer\n"));
    expect(profile.name).toBeNull();
    expect(meta.name).toMatchObject({ needsReview: true, alternatives: ["sam lee - aspiring developer"] });
  });

  it("flags an employer that looks like a job title", () => {
    const { profile, meta } = parseResumeDetailed(CLEAR.replace("Acme Corp | Software Developer Co-op", "Software Developer Co-op"));
    expect(meta[`experience.${profile.experience[0].id}`].needsReview).toBe(true);
  });

  it("offers skills from the experience when there's no Skills section, flagged", () => {
    const text = CLEAR.replace(/SKILLS[\s\S]*?(?=AWARDS)/, "");
    const { profile, meta } = parseResumeDetailed(text);
    expect(profile.skills).toEqual(expect.arrayContaining(["Python", "Flask", "React", "Docker"]));
    expect(meta.skills.needsReview).toBe(true);
    expectNothingInvented(text, profile);
  });

  it("finds nothing in an unstructured note, and invents nothing", () => {
    const text = "I am looking for a job. Please contact me.";
    const { profile, meta } = parseResumeDetailed(text);
    expect(profile.email).toBeNull();
    expect(profile.experience).toEqual([]);
    expect(meta.email.missing).toBe(true);
    expectNothingInvented(text, profile);
  });
});

describe("confirmFields", () => {
  it("clears the review flag on a field the user changed, and marks an emptied field missing", () => {
    const text = CLEAR.replace("Sep 2023 – Jun 2025", "2027").replace("Dean's List", "Dean's List 2024");
    const { profile, meta } = parseResumeDetailed(text);
    const id = profile.education[0].id;
    expect(meta[`education.${id}.graduation`].needsReview).toBe(true);
    const edited = { ...profile, phone: null, education: profile.education.map((e) => ({ ...e, graduation: "Apr 2027" })) };
    const next = confirmFields(profile, edited, meta);
    expect(next[`education.${id}.graduation`]).toMatchObject({ needsReview: false, confidence: 1 });
    expect(next.phone).toMatchObject({ missing: true });
  });

  it("clears a flag the user confirms without changing the value", () => {
    const { profile, meta } = parseResumeDetailed(CLEAR.replace("sam@example.com", "sam@example.com | sam.lee@school.ca"));
    expect(confirmFields(profile, profile, meta, ["email"]).email.needsReview).toBe(false);
  });
});

describe("reconcileWithAi", () => {
  const rules = parseResumeDetailed(CLEAR.replace(" | linkedin.com/in/samlee", ""));

  it("raises confidence where both readings agree and flags a value only the second reading found", () => {
    const ai = ResumeProfile.parse({ ...rules.profile, contact: { ...rules.profile.contact, linkedin: "linkedin.com/in/samlee" } });
    const r = reconcileWithAi(CLEAR, rules, ai);
    expect(r.meta.email.confidence).toBeGreaterThanOrEqual(0.95);
    expect(r.profile.contact.linkedin).toBe("linkedin.com/in/samlee");
    expect(r.meta["contact.linkedin"].needsReview).toBe(true);
  });

  it("flags disagreement with both readings", () => {
    const ai = ResumeProfile.parse({ ...rules.profile, location: "Vancouver, BC" });
    const r = reconcileWithAi(CLEAR, rules, ai);
    expect(r.profile.location).toBe("Burnaby, BC");
    expect(r.meta.location).toMatchObject({ needsReview: true, alternatives: ["Vancouver, BC"] });
  });
});
