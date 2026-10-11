import { describe, expect, it } from "vitest";
import { indexResume, matchFree, type ResumeLine } from "./match";
import { extractRequirements, extractRequirementsKeywords } from "./requirements";
import { skillsIn } from "./taxonomy";
import type { Requirement } from "./types";

const names = (t: string) => skillsIn(t).map((s) => s.name);

describe("taxonomy", () => {
  it("treats aliases as the same skill", () => {
    expect(names("Wrote Postgres migrations")).toEqual(["PostgreSQL"]);
    expect(names("Deployed to k8s on AWS")).toEqual(["AWS", "Kubernetes"]);
    expect(names("ReactJS and Node.js")).toEqual(["React", "Node.js"]);
  });
  it("keeps symbol-named languages apart", () => {
    expect(names("C++ and C#")).toEqual(["C#", "C++"]);
    expect(names("Embedded C/C++ firmware")).toEqual(expect.arrayContaining(["C++", "C programming", "Embedded C", "Firmware"]));
    expect(names("Plan C for C-level reporting")).toEqual([]);
  });
  it("doesn't read plain English as a skill", () => {
    expect(names("Go to market, take a REST, CAN do attitude, excel at spreadsheets, node of a network")).toEqual([]);
    expect(names("html5 pages")).toEqual(["HTML"]);
  });
});

describe("extractRequirements", () => {
  // Text as it comes from an employer's HTML: list items keep a bullet, headings don't.
  const posting = `About us
We build things.
What you'll do
• Ship features
What you'll need
• 3+ years of professional experience with Python
• Diploma or degree in Computer Science
• Experience with Postgres or MySQL
• Strong communication skills
• French is an asset
Nice to have
• Kubernetes
• P.Eng
Benefits
• Dental`;

  it("reads every line under requirement headings, by section", () => {
    const reqs = extractRequirements(posting);
    expect(reqs.map((r) => [r.text, r.kind, r.category])).toEqual([
      ["3+ years of professional experience with Python", "must", "years"],
      ["Diploma or degree in Computer Science", "must", "degree"],
      ["Experience with Postgres or MySQL", "must", "skill"],
      ["Strong communication skills", "must", "other"],
      ["French is an asset", "nice", "language"],
      ["Kubernetes", "nice", "skill"],
      ["P.Eng", "nice", "licence"],
    ]);
    expect(reqs[0].years).toBe(3);
    expect(reqs[1].degreeLevel).toBe("diploma");
  });

  it("skips lead-ins, filler and paragraphs seen on real boards", () => {
    const reqs = extractRequirements(`What we're looking for
• The ideal candidates should have strong technical experience in one (or more) of the following areas:
• Systems administration
• We consider all candidates with an eye for those who are self-taught.
• It's crucial for every candidate that they can check off all of these boxes
• About MongoDB
• Excellent communication skills, both written and verbal
• The Lead Software Developer is primarily responsible for designing, building and maintaining efficient code.`);
    expect(reqs.map((r) => r.text)).toEqual(["Systems administration", "Excellent communication skills, both written and verbal"]);
  });

  it("keeps unbulleted short lines inside a list as requirements", () => {
    const reqs = extractRequirements("Requirements:\nPython\nExcellent problem-solving\nSQL\nBenefits\nDental");
    expect(reqs.map((r) => r.text)).toEqual(["Python", "Excellent problem-solving", "SQL"]);
  });

  it("falls back to scanning when there are no headings", () => {
    const reqs = extractRequirements("We want someone with 5+ years of experience in Java and AWS. A bachelor's degree is required.");
    expect(reqs.find((r) => r.category === "years")?.years).toBe(5);
    expect(reqs.filter((r) => r.category === "skill").map((r) => r.text)).toEqual(["Java", "AWS"]);
    expect(extractRequirementsKeywords("Requirements\n- Diploma or degree").find((r) => r.category === "degree")?.degreeLevel).toBe("diploma");
  });
});

describe("matchFree", () => {
  const lines: ResumeLine[] = [
    { id: "x1b1", text: "Built REST APIs in Python and Flask used by 3 teams" },
    { id: "x1b2", text: "Wrote SQL migrations for Postgres" },
    { id: "p1b1", text: "React app for planning courses" },
    { id: "s1", text: "Bilingual in English and French." },
    { id: "c1", text: "EIT, Engineers and Geoscientists BC" },
  ];
  const resume = indexResume(lines);
  const req = (text: string, category: Requirement["category"] = "skill", kind: Requirement["kind"] = "must"): Requirement => ({ id: `r${text.length}`, text, kind, category, years: null, degreeLevel: null });
  const t = { met: 0.86, partial: 0.8 };
  const one = (r: Requirement, semantic: Map<string, { lineId: string; similarity: number }> | null = null) => matchFree([r], resume, semantic, t)[0];

  it("meets a skill through an alias, quoting the resume line", () => {
    expect(one(req("Experience with PostgreSQL"))).toMatchObject({ status: "met", quote: "Wrote SQL migrations for Postgres" });
  });
  it("accepts any one of a list joined by 'or'", () => {
    expect(one(req("Java, Python or Go"))).toMatchObject({ status: "met" });
    expect(one(req("Python and Kubernetes"))).toMatchObject({ status: "partial", note: "Your resume doesn't mention Kubernetes." });
  });
  it("gives partial credit for a skill from the same family", () => {
    expect(one(req("Vue.js"))).toMatchObject({ status: "partial", quote: "React app for planning courses", note: "Related: you have React, not Vue." });
  });
  it("misses a skill with nothing related", () => {
    expect(one(req("Terraform"))).toMatchObject({ status: "missing", quote: null });
  });
  it("uses meaning for lines without known skills, with thresholds", () => {
    const r = req("Experience designing web services", "other");
    expect(one(r, new Map([[r.id, { lineId: "x1b1", similarity: 0.9 }]]))).toMatchObject({ status: "met", quote: lines[0].text });
    expect(one(r, new Map([[r.id, { lineId: "x1b1", similarity: 0.82 }]]))).toMatchObject({ status: "partial" });
    expect(one(r, new Map([[r.id, { lineId: "x1b1", similarity: 0.7 }]]))).toMatchObject({ status: "partial", note: "No line in your resume clearly matches this." });
    expect(one(r)).toMatchObject({ status: "partial", note: "Couldn't check this automatically." });
  });
  it("checks languages and licences against the resume", () => {
    expect(one(req("Bilingual (English/French) required", "language"))).toMatchObject({ status: "met" });
    expect(one(req("Mandarin required", "language"))).toMatchObject({ status: "missing" });
    expect(one(req("EIT designation", "licence"))).toMatchObject({ status: "met" });
    expect(one(req("P.Eng required", "licence"))).toMatchObject({ status: "missing" });
  });
  it("leaves years and degree to the rules", () => {
    expect(one(req("5+ years", "years"))).toMatchObject({ status: "missing", quote: null });
  });
});
