import { describe, expect, it } from "vitest";
import { indexResume, matchFree, resumeLinesFrom } from "./match";
import { extractRequirements } from "./requirements";
import { resumeText } from "./resume";
import { alignWording, smartCoverLetter, smartTailorResume, type SmartInput } from "./smart-tailor";
import { skillsIn } from "./taxonomy";
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
      location: null,
      bullets: [
        { id: "x1b1", text: "Organized the team's weekly demo schedule" },
        { id: "x1b2", text: "Wrote SQL migrations for Postgres" },
        { id: "x1b3", text: "Built REST APIs in Python and Flask used by 3 teams" },
      ],
    },
    { id: "x2", organization: "Campus IT", title: "Help Desk Assistant", start: "Sep 2023", end: "Apr 2024", location: null, bullets: [{ id: "x2b1", text: "Resolved hardware tickets for staff" }] },
  ],
  education: [{ id: "d1", organization: "BCIT", title: "Diploma, Computer Systems Technology", start: "2023", end: "2025", location: null, bullets: [] }],
  projects: [
    { id: "p1", organization: "Recipe Blog", title: null, start: null, end: null, location: null, bullets: [{ id: "p1b1", text: "Wrote articles about baking" }] },
    { id: "p2", organization: "Course Planner", title: null, start: null, end: null, location: null, bullets: [{ id: "p2b1", text: "React app with a Python and Postgres backend" }] },
  ],
  skills: ["Excel", "Python", "Postgres", "Flask", "React"],
  certifications: [],
};
const raw = resumeText(profile, "");

const POSTING = `Requirements
• Python
• PostgreSQL
• Kubernetes
Nice to have
• React`;

function input(mode: SmartInput["mode"] = "normal"): SmartInput {
  const requirements = extractRequirements(POSTING);
  const results = matchFree(requirements, indexResume(resumeLinesFrom(profile)), null, { met: 0.86, partial: 0.8 });
  return { profile, resumeText: raw, years: 1.5, posting: { title: "Backend Developer", company: "Northwind", description: POSTING }, requirements, results, relevance: new Map(), mode };
}

describe("alignWording", () => {
  it("uses the posting's name for a skill the resume names differently", () => {
    expect(alignWording("Wrote SQL migrations for Postgres", skillsIn(POSTING), POSTING)).toEqual({ text: "Wrote SQL migrations for PostgreSQL", aligned: ["PostgreSQL"] });
    expect(alignWording("Organized demos", skillsIn(POSTING), POSTING).aligned).toEqual([]);
  });
});

describe("smartTailorResume", () => {
  const { doc, issues } = smartTailorResume(input());
  const acme = doc.sections.find((s) => s.key === "experience")!.entries[0];

  it("puts the most relevant real bullets first", () => {
    // Both relevant bullets (equally) come before the unrelated one.
    expect(acme.bullets.map((b) => b.sourceBulletIds[0])).toEqual(["x1b2", "x1b3", "x1b1"]);
    expect(acme.bullets[0].text).toBe("Wrote SQL migrations for PostgreSQL");
    expect(issues).toEqual([]);
  });

  it("keeps every job, drops irrelevant projects, and leads with matched skills", () => {
    expect(doc.sections.find((s) => s.key === "experience")!.entries.map((e) => e.organization)).toEqual(["Acme Corp", "Campus IT"]);
    expect(doc.sections.find((s) => s.key === "projects")!.entries.map((e) => e.organization)).toEqual(["Course Planner"]);
    expect(doc.skills).toEqual(["Python", "PostgreSQL", "React", "Excel", "Flask"]);
  });

  it("never adds a skill the resume doesn't have", () => {
    expect(JSON.stringify(doc)).not.toContain("Kubernetes");
  });
});

describe("smartCoverLetter", () => {
  it("builds from the person's own matched lines and passes the accuracy check", () => {
    const { doc, issues } = smartCoverLetter(input());
    expect(issues).toEqual([]);
    expect(doc.paragraphs[0]).toBe("I'm writing to apply for the Backend Developer position at Northwind. My background with Python, React and Postgres lines up with what the role needs.");
    expect(doc.paragraphs.join(" ")).toContain("At Acme Corp, I built REST APIs in Python and Flask used by 3 teams.");
    expect(doc.paragraphs.join(" ")).not.toContain("Kubernetes");
  });

  it("names a missing required skill honestly when applying anyway", () => {
    const { doc, issues } = smartCoverLetter(input("apply_anyway"));
    expect(issues).toEqual([]);
    expect(doc.paragraphs).toContain("I haven't yet worked with Kubernetes professionally, and I'm keen to learn quickly on the job.");
  });
});
