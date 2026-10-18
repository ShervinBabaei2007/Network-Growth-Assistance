import { describe, expect, it } from "vitest";
import { profileToDoc } from "./base-doc";
import { ResumeProfile } from "./types";

const profile = ResumeProfile.parse({
  name: "Sam Lee",
  email: "sam@example.com",
  phone: null,
  location: "Burnaby, BC",
  links: [],
  summary: "Developer.",
  experience: [{ id: "e1", organization: "Acme", title: "Developer", start: "2023", end: "2024", location: null, bullets: [{ id: "e1b1", text: "Built a thing" }] }],
  education: [{ id: "d1", organization: "BCIT", title: null, start: null, end: null, location: null, bullets: [] }],
  projects: [],
  skills: ["Python"],
  certifications: ["AWS"],
});

describe("a profile as a document", () => {
  it("copies the profile word for word and drops empty sections", () => {
    const doc = profileToDoc(profile);
    expect(doc.header.name).toBe("Sam Lee");
    expect(doc.summary).toBe("Developer.");
    expect(doc.skills).toEqual(["Python"]);
    expect(doc.certifications).toEqual(["AWS"]);
    expect(doc.sections.map((s) => s.key)).toEqual(["experience", "education"]);
    expect(doc.sections[0].entries[0].bullets).toEqual([{ text: "Built a thing", sourceBulletIds: ["e1b1"] }]);
  });
});
