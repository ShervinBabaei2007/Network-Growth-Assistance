import { describe, expect, it } from "vitest";
import { groundAiResume, highestDegree, parseResumeHeuristic, yearsOfExperience, type AiResume } from "./resume";

const TEXT = `Sam Lee
Burnaby, BC | sam@example.com | 604-555-0101 | github.com/samlee
SUMMARY
Developer who builds reliable web apps.
EXPERIENCE
Acme Corp | Software Developer Co-op    May 2024 – Dec 2024
• Built REST endpoints in Python and Flask serving 2,000 daily users
• Cut test suite runtime by 20% by parallelising
pytest across workers
Campus IT | Help Desk Assistant    Sep 2023 – Apr 2024
• Resolved hardware and network tickets for staff
PROJECTS
Course Planner
• React app for planning courses, deployed with Docker
EDUCATION
British Columbia Institute of Technology    2023 – 2025
Diploma, Computer Systems Technology
SKILLS
Languages: Python, JavaScript, SQL
Tools: Flask, React, Docker, Git`;

describe("parseResumeHeuristic", () => {
  const p = parseResumeHeuristic(TEXT);

  it("reads the header", () => {
    expect(p).toMatchObject({ name: "Sam Lee", email: "sam@example.com", location: "Burnaby, BC" });
    expect(p.links).toContain("github.com/samlee");
  });

  it("splits experience into entries with dates and bullets, joining wrapped lines", () => {
    expect(p.experience.map((e) => [e.organization, e.title, e.start, e.end])).toEqual([
      ["Acme Corp", "Software Developer Co-op", "May 2024", "Dec 2024"],
      ["Campus IT", "Help Desk Assistant", "Sep 2023", "Apr 2024"],
    ]);
    expect(p.experience[0].bullets[1].text).toBe("Cut test suite runtime by 20% by parallelising pytest across workers");
    expect(p.experience[0].bullets[0].id).toBe("x1b1");
  });

  it("reads projects, education and skills", () => {
    expect(p.projects[0].organization).toBe("Course Planner");
    expect(p.education[0].organization).toBe("British Columbia Institute of Technology");
    expect(p.skills).toEqual(["Python", "JavaScript", "SQL", "Flask", "React", "Docker", "Git"]);
  });

  it("derives years and degree level", () => {
    expect(yearsOfExperience(p, new Date("2026-10-11"))).toBe(1.3);
    expect(highestDegree(p)).toBe("diploma");
  });
});

describe("yearsOfExperience", () => {
  it("counts overlapping roles once and Present as now", () => {
    const base = parseResumeHeuristic(TEXT);
    const p = {
      ...base,
      experience: [
        { ...base.experience[0], start: "Jan 2024", end: "Present" },
        { ...base.experience[1], start: "Jun 2024", end: "Dec 2024" },
      ],
    };
    expect(yearsOfExperience(p, new Date("2026-01-15"))).toBe(2.1);
  });
});

describe("groundAiResume", () => {
  it("drops what the model added and keeps what's in the text", () => {
    const ai: AiResume = {
      name: "Sam Lee",
      email: "sam@example.com",
      phone: null,
      location: "Burnaby, BC",
      links: ["https://github.com/samlee"],
      summary: null,
      experience: [
        {
          organization: "Acme Corp",
          title: "Software Developer Co-op",
          start: "May 2024",
          end: "Dec 2024",
          location: null,
          bullets: ["Built REST endpoints in Python and Flask serving 2,000 daily users", "Led migration to Kubernetes"],
          degree: null,
          major: null,
          graduation: null,
        },
        { organization: "Google", title: "SWE", start: null, end: null, location: null, bullets: ["Did things"], degree: null, major: null, graduation: null },
      ],
      education: [
        {
          organization: "British Columbia Institute of Technology",
          title: "Diploma, Computer Systems Technology",
          start: "2023",
          end: "2025",
          location: null,
          bullets: [],
          degree: "Bachelor of Science",
          major: "Computer Systems Technology",
          graduation: "Expected 2031",
        },
      ],
      projects: [],
      skills: ["Python", "Kubernetes"],
      certifications: [],
      awards: [{ organization: "Dean's List", title: null, start: null, end: null, location: null, bullets: [], degree: null, major: null, graduation: null }],
      activities: [],
    };
    const p = groundAiResume(ai, TEXT);
    expect(p.experience.map((e) => e.organization)).toEqual(["Acme Corp"]);
    expect(p.experience[0].bullets.map((b) => b.text)).toEqual(["Built REST endpoints in Python and Flask serving 2,000 daily users"]);
    expect(p.skills).toEqual(["Python"]);
    expect(p.links).toEqual(["https://github.com/samlee"]);
    expect(p.contact).toEqual({ linkedin: null, github: "https://github.com/samlee", website: null });
    // A degree and a graduation date the resume doesn't state are dropped; the major it states is kept.
    expect(p.education[0]).toMatchObject({ degree: null, major: "Computer Systems Technology", graduation: null });
    expect(p.awards).toEqual([]);
  });
});
