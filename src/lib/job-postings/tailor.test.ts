import { describe, expect, it } from "vitest";
import type { AIProvider, AiTailoredResumeOut, JobContext } from "@/lib/ai/provider";
import { compareTailoring } from "./compare";
import { analyzeJob } from "./job-analysis";
import { indexResume, matchFree, resumeLinesFrom } from "./match";
import { extractRequirements } from "./requirements";
import { resumeText } from "./resume";
import { materiality, overlap, tailorDocument } from "./tailor";
import { ResumeProfile } from "./types";

const profile = ResumeProfile.parse({
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
      location: null,
      bullets: [
        { id: "x1b1", text: "Organized the team's weekly demo schedule" },
        { id: "x1b2", text: "Built backend functionality for the ordering application in Node.js and PostgreSQL" },
        { id: "x1b3", text: "Wrote React components for the checkout page" },
      ],
    },
  ],
  education: [{ id: "d1", organization: "BCIT", title: "Diploma, Computer Systems Technology", start: "2023", end: "2025", location: null, bullets: [] }],
  projects: [{ id: "p1", organization: "Course Planner", title: null, start: null, end: null, location: null, bullets: [{ id: "p1b1", text: "TypeScript and React app for planning courses" }] }],
  // The skills the job wants are at the end, as on many real resumes.
  skills: ["Excel", "Word", "Figma", "Jira", "Trello", "Slack", "Photoshop", "Zoom", "React", "Node.js", "PostgreSQL", "TypeScript"],
  certifications: [],
});
const raw = resumeText(profile, "");

const POSTING = `Full Stack Developer
Requirements
• React and TypeScript
• Node.js REST APIs
• PostgreSQL
• AWS
Nice to have
• Docker`;
const requirements = extractRequirements(POSTING);
const results = matchFree(requirements, indexResume(resumeLinesFrom(profile)), null, { met: 0.86, partial: 0.8 });
const analysis = analyzeJob({ title: "Full Stack Developer", description: POSTING }, requirements);
const context: JobContext & { resumeText: string; format: "resume" } = {
  profile,
  posting: { title: "Full Stack Developer", company: "Maple", description: POSTING },
  requirements,
  results,
  keywords: analysis.atsKeywords.map((k) => k.term),
  mode: "normal",
  resumeText: raw,
  format: "resume",
};

/** The original lines, unchanged: what a model that "tailors" by doing nothing returns. */
const unchanged: AiTailoredResumeOut = {
  summary: profile.summary,
  skills: profile.skills,
  experience: [{ sourceId: "x1", bullets: profile.experience[0].bullets.map((b) => ({ text: b.text, sourceBulletIds: [b.id] })) }],
  projects: [{ sourceId: "p1", bullets: [{ text: "TypeScript and React app for planning courses", sourceBulletIds: ["p1b1"] }] }],
  sectionOrder: ["experience", "projects", "education"],
};

/**
 * A truthful rewrite in the posting's language, plus one invented skill for the guard to catch.
 * ("REST APIs" would also be rejected: the resume says "backend functionality", not REST.)
 */
const rewritten: AiTailoredResumeOut = {
  summary: "Full stack developer with co-op experience building backend services in Node.js and PostgreSQL and React interfaces in TypeScript.",
  skills: ["React", "TypeScript", "Node.js", "PostgreSQL", "AWS", "Excel", "Jira"],
  experience: [
    {
      sourceId: "x1",
      bullets: [
        { text: "Developed backend services in Node.js and PostgreSQL for the ordering application", sourceBulletIds: ["x1b2"] },
        { text: "Implemented checkout page features as React components", sourceBulletIds: ["x1b3"] },
        { text: "Coordinated weekly team demos", sourceBulletIds: ["x1b1"] },
        { text: "Deployed services to AWS Lambda", sourceBulletIds: ["x1b2"] },
      ],
    },
  ],
  projects: [{ sourceId: "p1", bullets: [{ text: "Course planning web app built with React and TypeScript", sourceBulletIds: ["p1b1"] }] }],
  sectionOrder: ["experience", "projects", "education"],
};

function stub(outputs: AiTailoredResumeOut[]): AIProvider & { calls: number; feedback: (string | undefined)[] } {
  const s = {
    name: "stub",
    calls: 0,
    feedback: [] as (string | undefined)[],
    parseResume: async () => ({ ok: false as const, reason: "n/a" }),
    extractJobRequirements: async () => ({ ok: false as const, reason: "n/a" }),
    generateCoverLetter: async () => ({ ok: false as const, reason: "n/a" }),
    generateResumeImprovementNotes: async () => ({ ok: false as const, reason: "n/a" }),
    parsePosting: async () => ({ ok: false as const, reason: "n/a" }),
    tailorResume: async (_: JobContext, feedback?: string) => {
      s.feedback.push(feedback);
      return { ok: true as const, data: outputs[Math.min(s.calls++, outputs.length - 1)] };
    },
    tailorCV: async (_: JobContext, feedback?: string) => {
      s.feedback.push(feedback);
      return { ok: true as const, data: outputs[Math.min(s.calls++, outputs.length - 1)] };
    },
  };
  return s;
}

describe("overlap and materiality", () => {
  it("measures word overlap", () => {
    expect(overlap("Built REST APIs in Python", "Built REST APIs in Python")).toBe(1);
    expect(overlap("Coordinated weekly team demos", "Organized the team's weekly demo schedule")).toBeLessThan(0.5);
  });

  it("calls a copy of the original not material", () => {
    const copy = {
      header: { name: "Sam Lee", email: null, phone: null, location: null, links: [] },
      summary: profile.summary,
      skills: profile.skills,
      sections: [{ key: "experience" as const, entries: [{ sourceId: "x1", organization: "Acme Corp", title: null, start: null, end: null, location: null, bullets: profile.experience[0].bullets.map((b) => ({ text: b.text, sourceBulletIds: [b.id] })) }] }],
      certifications: [],
    };
    expect(materiality(profile, copy)).toMatchObject({ bullets: 3, reworded: 0, summaryChanged: false, material: false });
  });
});

describe("tailorDocument", () => {
  it("produces a materially different, job-specific resume, and strips what the resume doesn't support", async () => {
    const before = JSON.stringify(profile);
    const ai = stub([rewritten]);
    const r = await tailorDocument(ai, context);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(ai.calls).toBe(2); // the invented AWS line was rejected, so the model got one retry with the reasons
    expect(r.materiality.material).toBe(true);
    expect(r.materiality.share).toBeGreaterThanOrEqual(0.4);
    const text = JSON.stringify(r.doc);
    // The relevant experience leads, in the posting's words.
    expect(r.doc.sections[0].entries[0].bullets[0].text).toBe("Developed backend services in Node.js and PostgreSQL for the ordering application");
    // AWS is a requirement the resume doesn't show: never added.
    expect(text).not.toContain("AWS");
    expect(r.issues.map((i) => i.text)).toEqual(expect.arrayContaining(["AWS", "Deployed services to AWS Lambda"]));
    // The original resume is untouched.
    expect(JSON.stringify(profile)).toBe(before);
  });

  it("retries once when the result is near-identical, then gives up without a document", async () => {
    const ai = stub([unchanged, unchanged]);
    const r = await tailorDocument(ai, context);
    expect(ai.calls).toBe(2);
    expect(ai.feedback[1]).toMatch(/too close to the original/);
    expect(r).toMatchObject({ ok: false, reason: "not_material" });
    expect("doc" in r).toBe(false);
  });

  it("accepts the retry when the second attempt is material", async () => {
    const ai = stub([unchanged, rewritten]);
    const r = await tailorDocument(ai, context);
    expect(r.ok).toBe(true);
  });

  it("reports an AI failure without a document", async () => {
    const ai = { ...stub([]), tailorResume: async () => ({ ok: false as const, reason: "The AI service is busy right now." }) };
    expect(await tailorDocument(ai, context)).toMatchObject({ ok: false, reason: "ai_failed", error: "The AI service is busy right now." });
  });

  it("a CV keeps every line", async () => {
    const ai = stub([rewritten]);
    const r = await tailorDocument(ai, { ...context, format: "cv" });
    if (!r.ok) throw new Error("expected a CV");
    const ids = r.doc.sections.flatMap((s) => s.entries.flatMap((e) => e.bullets.flatMap((b) => b.sourceBulletIds)));
    expect(ids).toEqual(expect.arrayContaining(["x1b1", "x1b2", "x1b3", "p1b1"]));
  });
});

describe("compareTailoring", () => {
  it("computes before and after the same way, and explains the change from real matches", async () => {
    const r = await tailorDocument(stub([rewritten]), context);
    if (!r.ok) throw new Error("expected a document");
    const applicant = { years: 0.7, degree: "diploma" as const, facts: { workAuthorization: "citizen" as const, securityClearance: false, willingToRelocate: false, yearsOverride: null } };
    const c = compareTailoring({ profile, doc: r.doc, analysis, requirements, applicant, postingText: POSTING, materiality: r.materiality });
    const again = compareTailoring({ profile, doc: r.doc, analysis, requirements, applicant, postingText: POSTING, materiality: r.materiality });
    expect(again).toEqual(c);
    expect(c.keywordMatch.after).toBeGreaterThan(c.keywordMatch.before);
    expect(c.keywordsSurfaced.length).toBeGreaterThan(0);
    expect(c.keywordsMissing).toEqual(expect.arrayContaining(["AWS"]));
    expect(c.missingRequirements.map((m) => m.text)).toContain("AWS");
    expect(c.explanation.join(" ")).toMatch(/Not in your resume, so not added: .*AWS/);
    // Truthful tailoring can't meet a requirement the resume doesn't.
    expect(c.requirementMatch.after).toBeLessThanOrEqual(100);
  });
});
