import { describe, expect, it } from "vitest";
import { buildPrepPack, bulletsForRequirement, packToMarkdown, significantWords, type PrepInput } from "./prep";

const BULLETS = [
  { id: "b1", text: "Led a team of four to build a booking system in React and Node.js", source: "Developer, Acme" },
  { id: "b2", text: "Reduced page load time by 40% by optimizing database queries", source: "Developer, Acme" },
  { id: "b3", text: "Learned Python in two weeks to automate weekly reports", source: "Project, Reports" },
  { id: "b4", text: "Volunteered as event coordinator for 200 attendees", source: "Club" },
];

const INPUT: PrepInput = {
  title: "Frontend Developer",
  company: "Northwind",
  stage: "interviewing",
  postingUrl: "https://example.com/jobs/1",
  requirements: [
    { text: "Experience with React and TypeScript", kind: "must", category: "skill" },
    { text: "Knowledge of PostgreSQL databases", kind: "must", category: "skill" },
    { text: "Kubernetes experience", kind: "must", category: "skill" },
    { text: "Bachelor's degree in computer science", kind: "nice", category: "education" },
  ],
  bullets: BULLETS,
  interviews: [{ startsAt: "2030-01-15T17:00:00Z", timezone: "America/Vancouver", kind: "video", location: null, durationMinutes: 45 }],
};

describe("significantWords", () => {
  it("keeps meaningful words and drops filler and plurals", () => {
    expect(significantWords("Strong experience with databases and systems")).toEqual(expect.arrayContaining(["database", "system"]));
    expect(significantWords("Strong experience with the team")).toEqual([]);
  });
});

describe("matching a requirement to the user's own bullets", () => {
  it("finds the line that names the skill", () => {
    expect(bulletsForRequirement("Experience with React and TypeScript", BULLETS).map((b) => b.id)).toEqual(["b1"]);
  });
  it("finds nothing rather than guessing when no line fits", () => {
    expect(bulletsForRequirement("Kubernetes experience", BULLETS)).toEqual([]);
    expect(bulletsForRequirement("", BULLETS)).toEqual([]);
  });
});

describe("buildPrepPack", () => {
  const pack = buildPrepPack(INPUT, new Date("2029-12-01T00:00:00Z"));

  it("only ever quotes the user's own resume lines", () => {
    const texts = new Set(BULLETS.map((b) => b.text));
    for (const q of [...pack.behavioural, ...pack.technical]) for (const s of q.stories) expect(texts.has(s.bullet.text)).toBe(true);
  });

  it("matches stories to the right questions", () => {
    const team = pack.behavioural.find((q) => q.question.includes("team"))!;
    expect(team.stories.map((s) => s.bullet.id)).toContain("b1");
    const learn = pack.behavioural.find((q) => q.question.includes("learned"))!;
    expect(learn.stories.map((s) => s.bullet.id)).toContain("b3");
    const result = pack.behavioural.find((q) => q.question.includes("proud"))!;
    expect(result.stories.some((s) => /\d/.test(s.bullet.text))).toBe(true);
  });

  it("asks about each required item, and says plainly when the resume has nothing for it", () => {
    expect(pack.technical).toHaveLength(3);
    const k8s = pack.technical.find((q) => q.question.includes("Kubernetes"))!;
    expect(k8s.stories).toEqual([]);
    expect(k8s.empty).toMatch(/honest about the gap/);
  });

  it("does not invent anything about the company", () => {
    const all = JSON.stringify(pack);
    expect(pack.sources).toEqual([{ label: "The posting you saved for Frontend Developer at Northwind", href: "https://example.com/jobs/1" }]);
    expect(all).not.toMatch(/founded|headquarter|employees|revenue|CEO/i);
    expect(pack.notes[0]).toMatch(/Nothing was added about the company/);
  });

  it("puts required topics first and groups them", () => {
    expect(pack.topics[0].category).toBe("Skills and tools");
    expect(pack.topics[0].items[0].kind).toBe("must");
  });

  it("uses the next interview in the checklist, in its own time zone", () => {
    expect(pack.checklist[0]).toMatch(/Confirm the time: .*PST|PDT|GMT|UTC/);
    expect(pack.checklist[1]).toMatch(/microphone/);
  });

  it("asks to add the time when there is no upcoming interview", () => {
    const none = buildPrepPack({ ...INPUT, interviews: [] });
    expect(none.checklist[0]).toMatch(/Add the interview time/);
  });

  it("still works with no resume and no posting", () => {
    const bare = buildPrepPack({ ...INPUT, bullets: [], requirements: [], postingUrl: null, company: null });
    expect(bare.behavioural.every((q) => q.stories.length === 0 && /Add your resume/.test(q.empty))).toBe(true);
    expect(bare.technical).toEqual([]);
    expect(bare.sources).toEqual([]);
    expect(bare.heading).toBe("Interview prep: Frontend Developer");
  });
});

describe("packToMarkdown", () => {
  it("exports every section", () => {
    const md = packToMarkdown(buildPrepPack(INPUT, new Date("2029-12-01T00:00:00Z")));
    for (const h of ["# Interview prep: Frontend Developer at Northwind", "## Sources", "## Likely topics", "## Questions they are likely to ask", "## Questions to ask them", "## Checklist", "## Notes"]) expect(md).toContain(h);
    expect(md).toContain("- [ ] ");
    expect(md).toContain("From your resume (Developer, Acme): Led a team of four");
  });
});
