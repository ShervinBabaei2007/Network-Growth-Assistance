import { describe, expect, it } from "vitest";
import { unknownTerms } from "@/lib/text/terms";
import { checkBullet, checkLetterSentence, guardCoverLetter, guardResume, type AiTailoredResume } from "./tailor-guard";
import type { ResumeProfile } from "./types";

const profile: ResumeProfile = {
  name: "Sam Lee",
  email: "sam@example.com",
  phone: null,
  location: "Burnaby, BC",
  links: [],
  summary: "Developer who builds reliable web apps.",
  experience: [
    {
      id: "x1",
      organization: "Acme Corp",
      title: "Software Developer Co-op",
      start: "May 2024",
      end: "Dec 2024",
      location: "Vancouver, BC",
      bullets: [
        { id: "x1b1", text: "Built REST endpoints in Python and Flask serving 2,000 daily users" },
        { id: "x1b2", text: "Cut test suite runtime by 20% by parallelising pytest" },
        { id: "x1b3", text: "Wrote SQL migrations for PostgreSQL" },
      ],
    },
    {
      id: "x2",
      organization: "Campus IT",
      title: "Help Desk Assistant",
      start: "Sep 2023",
      end: "Apr 2024",
      location: null,
      bullets: [{ id: "x2b1", text: "Resolved hardware and network tickets for staff" }],
    },
  ],
  education: [{ id: "d1", organization: "BCIT", title: "Diploma, Computer Systems Technology", start: "2023", end: "2025", location: null, bullets: [] }],
  projects: [{ id: "p1", organization: "Course Planner", title: null, start: null, end: null, location: null, bullets: [{ id: "p1b1", text: "React app for planning courses, deployed with Docker" }] }],
  skills: ["Python", "Flask", "SQL", "PostgreSQL", "React", "Docker", "pytest"],
  certifications: [],
};
const resumeText = [
  "Sam Lee",
  "Acme Corp Software Developer Co-op",
  ...profile.experience.flatMap((e) => e.bullets.map((b) => b.text)),
  ...profile.projects.flatMap((e) => e.bullets.map((b) => b.text)),
  "BCIT Diploma, Computer Systems Technology",
  `Skills: ${profile.skills.join(", ")}`,
].join("\n");

const tailored = (over: Partial<AiTailoredResume> = {}): AiTailoredResume => ({
  summary: "Developer with Python and Flask experience building REST APIs.",
  skills: ["Python", "Flask", "PostgreSQL"],
  experience: [{ sourceId: "x1", bullets: [{ text: "Built Python and Flask REST endpoints serving 2,000 daily users", sourceBulletIds: ["x1b1"] }] }],
  projects: [],
  sectionOrder: ["experience", "projects", "education"],
  ...over,
});

describe("checkBullet", () => {
  it("accepts a faithful rewrite", () => {
    expect(checkBullet("Developed REST endpoints with Python and Flask for 2,000 daily users", [profile.experience[0].bullets[0].text], resumeText)).toBeNull();
  });
  it("rejects an inflated number", () => {
    expect(checkBullet("Cut test suite runtime by 40% by parallelising pytest", ["Cut test suite runtime by 20% by parallelising pytest"], resumeText)).toMatch(/number 40/);
  });
  it("rejects a technology the resume doesn't have", () => {
    expect(checkBullet("Built REST endpoints in Python and Kubernetes", [profile.experience[0].bullets[0].text], resumeText)).toMatch(/Kubernetes/);
  });
  it("rejects a bullet that cites nothing", () => {
    expect(checkBullet("Built things", [], resumeText)).toMatch(/original line/);
  });
  it("matches whole words, so Java is not found in JavaScript", () => {
    expect(unknownTerms("Wrote Java services", "Wrote JavaScript code")).toEqual(["Java"]);
  });
});

describe("guardResume", () => {
  it("copies employers, titles and dates from the resume, not the model", () => {
    const { doc, issues } = guardResume(tailored(), profile, resumeText);
    const acme = doc.sections.find((s) => s.key === "experience")!.entries[0];
    expect(acme).toMatchObject({ organization: "Acme Corp", title: "Software Developer Co-op", start: "May 2024", end: "Dec 2024" });
    expect(issues).toEqual([]);
  });

  it("removes an invented employer", () => {
    const { doc, issues } = guardResume(tailored({ experience: [{ sourceId: "x9", bullets: [{ text: "Led AI at Google", sourceBulletIds: [] }] }] }), profile, resumeText);
    expect(JSON.stringify(doc)).not.toContain("Google");
    expect(issues[0]).toMatchObject({ action: "removed" });
  });

  it("puts the original bullet back when a rewrite inflates a number", () => {
    const { doc, issues } = guardResume(
      tailored({ experience: [{ sourceId: "x1", bullets: [{ text: "Cut test suite runtime by 40% by parallelising pytest", sourceBulletIds: ["x1b2"] }] }] }),
      profile,
      resumeText,
    );
    const bullets = doc.sections.find((s) => s.key === "experience")!.entries[0].bullets.map((b) => b.text);
    expect(bullets).toEqual(["Cut test suite runtime by 20% by parallelising pytest"]);
    expect(issues[0]).toMatchObject({ action: "replaced_with_original" });
  });

  it("drops skills taken from the posting", () => {
    const { doc, issues } = guardResume(tailored({ skills: ["Python", "Kubernetes", "Terraform"] }), profile, resumeText);
    expect(doc.skills).toEqual(["Python"]);
    expect(issues.filter((i) => i.where === "Skills")).toHaveLength(2);
  });

  it("never drops a job, even if the model leaves it out", () => {
    const { doc } = guardResume(tailored(), profile, resumeText);
    expect(doc.sections.find((s) => s.key === "experience")!.entries.map((e) => e.organization)).toEqual(["Acme Corp", "Campus IT"]);
  });

  it("falls back to the original summary when the new one invents", () => {
    const { doc, issues } = guardResume(tailored({ summary: "Developer with 5 years of AWS experience." }), profile, resumeText);
    expect(doc.summary).toBe(profile.summary);
    expect(issues[0].where).toBe("Summary");
  });
});

describe("cover letter", () => {
  const posting = { text: "We use Kubernetes, Go and Python. 3+ years of experience required.", company: "Northwind", title: "Backend Developer" };

  it("rejects claiming experience with a technology only the posting mentions", () => {
    expect(checkLetterSentence("I'm proficient in Kubernetes and have used it in production.", resumeText, posting)).toMatch(/Kubernetes/);
    expect(checkLetterSentence("I have hands-on experience with Kubernetes.", resumeText, posting)).toMatch(/claims experience/);
  });

  it("allows saying they want to learn it", () => {
    expect(checkLetterSentence("I'm eager to learn Kubernetes on your team.", resumeText, posting)).toBeNull();
  });

  it("allows real experience and the company's name", () => {
    expect(checkLetterSentence("At Acme Corp I built REST endpoints in Python and Flask for Northwind-scale traffic.", resumeText, posting)).toBeNull();
  });

  it("rejects names from neither the resume nor the posting", () => {
    expect(checkLetterSentence("I worked closely with Microsoft on this.", resumeText, posting)).toMatch(/Microsoft/);
  });

  it("rejects numbers the resume doesn't have when claiming", () => {
    expect(checkLetterSentence("I have 3 years of Python experience.", resumeText, posting)).toMatch(/number 3/);
  });

  it("keeps passing sentences and reports the rest", () => {
    const { doc, issues } = guardCoverLetter(
      {
        greeting: "Dear Hiring Manager,",
        paragraphs: ["I'm applying for the Backend Developer role at Northwind. I have years of Kubernetes experience.", "At Acme Corp I wrote SQL migrations for PostgreSQL."],
        closing: "Sincerely",
      },
      profile,
      resumeText,
      posting,
    );
    expect(doc.paragraphs).toEqual(["I'm applying for the Backend Developer role at Northwind.", "At Acme Corp I wrote SQL migrations for PostgreSQL."]);
    expect(doc.closing).toBe("Sincerely,");
    expect(issues).toHaveLength(1);
  });
});
