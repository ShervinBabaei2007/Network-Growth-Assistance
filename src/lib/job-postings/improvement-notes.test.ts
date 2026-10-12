import { describe, expect, it } from "vitest";
import { analyzeJob, groundJobAnalysis, responsibilitiesIn } from "./job-analysis";
import { buildImprovementNotes, isVague, mergeAiNotes, rankResumeContent } from "./improvement-notes";
import { indexResume, matchFree, resumeLinesFrom } from "./match";
import { extractRequirements } from "./requirements";
import { resumeText } from "./resume";
import { ResumeProfile } from "./types";

const POSTING = `Full Stack Developer at Maple Commerce

What you'll do
• Build REST APIs and React interfaces
• Write tests and review code

Requirements
• 1+ years of experience building web applications
• React, TypeScript and Node.js
• PostgreSQL
• REST APIs
Nice to have
• AWS
• Docker

We use React and TypeScript across the stack. TypeScript is used everywhere.`;

const profile = ResumeProfile.parse({
  name: "Sam Lee",
  email: "sam@example.com",
  phone: null,
  location: "Burnaby, BC",
  links: [],
  summary: "Hard-working student who loves learning.",
  experience: [
    {
      id: "x1",
      organization: "Acme Corp",
      title: "Software Developer Co-op",
      start: "Jan 2024",
      end: "Aug 2025",
      location: null,
      bullets: [
        { id: "x1b1", text: "Helped with various team tasks" },
        { id: "x1b2", text: "Organized the team's weekly demo schedule" },
        { id: "x1b3", text: "Built REST APIs in Node.js and PostgreSQL for the ordering system" },
      ],
    },
  ],
  education: [{ id: "d1", organization: "BCIT", title: "Diploma, Computer Systems Technology", start: "2023", end: "2025", location: null, bullets: [], degree: "Diploma", major: "Computer Systems Technology", graduation: "2025" }],
  projects: [
    { id: "p1", organization: "Recipe Blog", title: null, start: null, end: null, location: null, bullets: [{ id: "p1b1", text: "Wrote articles about baking" }] },
    { id: "p2", organization: "Shop Demo", title: null, start: null, end: null, location: null, bullets: [{ id: "p2b1", text: "E-commerce site in React and TypeScript" }] },
  ],
  skills: ["Excel", "Word", "Figma", "Jira", "Trello", "Slack", "Photoshop", "Zoom", "Git", "React", "Node.js", "PostgreSQL"],
  certifications: [],
});
const raw = resumeText(profile, "");
const posting = { title: "Full Stack Developer", company: "Maple Commerce", description: POSTING };
const requirements = extractRequirements(POSTING);
const results = matchFree(requirements, indexResume(resumeLinesFrom(profile)), null, { met: 0.86, partial: 0.8 });
const analysis = analyzeJob(posting, requirements);
const applicant = { years: 1.6, degree: "diploma" as const, facts: { workAuthorization: "citizen" as const, securityClearance: false, willingToRelocate: false, yearsOverride: null } };

/** Deep-freezes an object so any attempt to change it throws. */
function freeze<T>(o: T): T {
  if (o && typeof o === "object") {
    Object.freeze(o);
    for (const v of Object.values(o)) freeze(v);
  }
  return o;
}

describe("analyzeJob", () => {
  it("separates required and preferred skills, technologies, responsibilities and years", () => {
    expect(analysis.requiredSkills).toEqual(expect.arrayContaining(["React", "TypeScript", "Node.js", "PostgreSQL", "REST API"]));
    expect(analysis.preferredSkills).toEqual(expect.arrayContaining(["AWS", "Docker"]));
    expect(analysis.technologies.languages).toContain("TypeScript");
    expect(analysis.technologies.frameworks).toContain("React");
    expect(analysis.responsibilities).toEqual(["Build REST APIs and React interfaces", "Write tests and review code"]);
    expect(analysis.yearsRequired).toBe(1);
    expect(analysis.requiredQualifications.join(" ")).toMatch(/1\+ years/);
  });

  it("ranks ATS keywords: required first, then by how often the posting uses them", () => {
    const terms = analysis.atsKeywords.map((k) => k.term);
    expect(terms.indexOf("TypeScript")).toBeLessThan(terms.indexOf("AWS"));
    expect(analysis.atsKeywords.find((k) => k.term === "TypeScript")!.count).toBeGreaterThanOrEqual(3);
  });

  it("keeps only AI-read items the posting really says", () => {
    const g = groundJobAnalysis(analysis, { requiredSkills: ["React", "Kubernetes"], preferredSkills: [], responsibilities: ["Review code"], requiredQualifications: [], preferredQualifications: [], keywords: ["ordering system", "web applications"] }, POSTING);
    expect(g.requiredSkills).not.toContain("Kubernetes");
    expect(g.atsKeywords.map((k) => k.term)).toContain("web applications");
    expect(g.atsKeywords.map((k) => k.term)).not.toContain("ordering system");
    expect(responsibilitiesIn("Responsibilities\n• Ship features\nRequirements\n• Go")).toEqual(["Ship features"]);
  });
});

describe("buildImprovementNotes", () => {
  const frozen = freeze(structuredClone(profile));
  const report = buildImprovementNotes({ profile: frozen, analysis, requirements, results, applicant, posting });
  const recs = report.notes.map((n) => n.recommendation).join("\n");

  it("never changes the resume it reads", () => {
    expect(frozen).toEqual(profile);
  });

  it("shows strong matches, what could be emphasized and what's missing", () => {
    const strong = report.comparison.strong.map((k) => k.term);
    const emphasize = report.comparison.couldEmphasize.map((k) => k.term);
    const missing = report.comparison.notFound.map((k) => k.term);
    // React and TypeScript lead a project; the API work is a third bullet and the skills sit at the end of the list.
    expect(strong).toEqual(expect.arrayContaining(["React", "TypeScript"]));
    expect(emphasize).toEqual(expect.arrayContaining(["REST API", "Node.js", "PostgreSQL"]));
    expect(missing).toEqual(expect.arrayContaining(["AWS", "Docker"]));
    expect(report.comparison.notFound.find((k) => k.term === "AWS")!.message).toBe(
      "AWS is listed as a preferred qualification, but it was not found in your resume. Do not add it unless you genuinely have that experience.",
    );
  });

  it("gives specific, prioritized notes tied to the job and the resume", () => {
    // A required skill the person has, but only in a project: add it to Skills.
    expect(report.notes.find((n) => n.section === "skills" && /Add TypeScript to your Skills/.test(n.recommendation))?.priority).toBe("high");
    // Relevant work buried as the third bullet.
    const buried = report.notes.find((n) => n.section === "experience" && n.target === "x1b3");
    expect(buried).toMatchObject({ priority: "high" });
    expect(buried!.why).toMatch(/REST API|Node\.js|PostgreSQL/);
    // A vague bullet, with guidance that doesn't invent anything.
    const vague = report.notes.find((n) => n.target === "x1b1");
    expect(vague!.recommendation).toMatch(/^If accurate, rewrite/);
    // The more relevant project is listed second.
    expect(report.notes.find((n) => n.section === "projects" && n.target === "p2")?.priority).toBe("high");
    // The summary doesn't name any of the skills.
    expect(report.notes.find((n) => n.section === "summary")).toBeDefined();
  });

  it("explains every note", () => {
    for (const n of report.notes) expect(n.why.length).toBeGreaterThan(20);
  });

  it("never suggests adding a skill the resume doesn't have, or a number", () => {
    expect(recs).not.toMatch(/\b(add|move|mention)\b[^.]*\b(AWS|Docker)\b/i);
    expect(recs).not.toMatch(/\d+%/);
  });

  it("finds only optional notes for a resume that already fits well", () => {
    const strongProfile = ResumeProfile.parse({
      ...profile,
      summary: "Full stack developer building React and TypeScript interfaces and Node.js REST APIs with PostgreSQL, with 1.6 years of co-op experience.",
      skills: ["React", "TypeScript", "Node.js", "PostgreSQL", "REST APIs", "Git"],
      experience: [{ ...profile.experience[0], bullets: [profile.experience[0].bullets[2], { id: "x1b4", text: "Wrote React and TypeScript components for the checkout flow" }] }],
      projects: [profile.projects[1]],
    });
    const r = buildImprovementNotes({ profile: strongProfile, analysis, requirements, results: matchFree(requirements, indexResume(resumeLinesFrom(strongProfile)), null, { met: 0.86, partial: 0.8 }), applicant, posting });
    expect(r.strongMatch).toBe(true);
    expect(r.notes.every((n) => n.priority === "optional")).toBe(true);
  });
});

describe("rankResumeContent and isVague", () => {
  it("ranks projects and bullets by what the posting asks for", () => {
    const r = rankResumeContent(profile, analysis, results);
    expect(r.projects.find((p) => p.entry.id === "p2")!.score).toBeGreaterThan(r.projects.find((p) => p.entry.id === "p1")!.score);
    expect(isVague("Helped with various team tasks")).toBe(true);
    expect(isVague("Built REST APIs in Node.js and PostgreSQL for the ordering system")).toBe(false);
  });
});

describe("mergeAiNotes", () => {
  const base = buildImprovementNotes({ profile, analysis, requirements, results, applicant, posting });

  it("keeps grounded advice and rejects notes that invent skills, numbers or targets", () => {
    const { report, rejected } = mergeAiNotes(
      base,
      {
        notes: [
          { section: "experience", priority: "medium", target: "x1b2", recommendation: "If accurate, say what the demos showed and who attended.", why: "The posting asks you to review code with a team." },
          { section: "skills", priority: "high", target: null, recommendation: "Add AWS to your skills.", why: "The posting prefers AWS." },
          { section: "experience", priority: "high", target: "x1b3", recommendation: "Say the APIs served 10,000 users.", why: "Numbers stand out." },
          { section: "experience", priority: "high", target: "x9b9", recommendation: "Move this higher.", why: "It matters." },
          { section: "experience", priority: "medium", target: "x1b3", recommendation: "Mention Kubernetes deployments.", why: "Modern teams use it." },
        ],
      },
      profile,
      raw,
      POSTING,
    );
    expect(rejected).toBe(4);
    expect(report.notes.filter((n) => n.source === "ai").map((n) => n.target)).toEqual(["x1b2"]);
    expect(report.method).toBe("ai");
  });
});
