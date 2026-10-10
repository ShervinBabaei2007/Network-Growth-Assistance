import { describe, expect, it } from "vitest";
import { classifyCandidate, classifyDiscipline, classifyUniversity } from "./index";

describe("classifyUniversity", () => {
  it.each([
    ["University of Toronto", "uoft"],
    ["U of T Engineering", "uoft"],
    ["UofT", "uoft"],
    ["University of Toronto Scarborough", "uoft"],
    ["UTSC", "uoft"],
    ["The University of British Columbia", "ubc"],
    ["UBC Vancouver", "ubc"],
    ["Simon Fraser University", "sfu"],
    ["SFU", "sfu"],
    ["University of Waterloo", "waterloo"],
    ["uWaterloo", "waterloo"],
    ["Université de Toronto?", null],
  ])("%s → %s", (text, expected) => {
    const r = classifyUniversity(text);
    expect(r.value).toBe(expected);
    expect(r.confidence).toBe(expected ? "confirmed" : "needs_review");
  });

  it.each([
    ["Toronto Metropolitan University", "different school"],
    ["Wilfrid Laurier University, Waterloo", "different school"],
    ["Waterloo, Ontario", "not clearly the University of Waterloo"],
    ["Toronto", "not clearly the University of Toronto"],
    ["University of Waterloo → UBC", "more than one"],
    ["BCIT", "Not one of the four"],
    ["", "No school"],
  ])("sends %s to review (%s)", (text, reason) => {
    const r = classifyUniversity(text);
    expect(r.value).toBeNull();
    expect(r.confidence).toBe("needs_review");
    expect(r.reason).toContain(reason);
  });

  it("follows the UBC Okanagan setting", () => {
    expect(classifyUniversity("UBC Okanagan").value).toBe("ubc");
    const excluded = classifyUniversity("UBC Okanagan", { countUbcoAsUbc: false });
    expect(excluded.value).toBeNull();
    expect(excluded.reason).toContain("Okanagan");
  });
});

describe("classifyDiscipline", () => {
  it.each([
    ["Computer Engineering", null, "ce"],
    ["BASc Computer Engineering, 2027", null, "ce"],
    ["CPEN student", "ubc", "ce"],
    ["Electrical Engineering", null, "ee"],
    ["Electronics Engineering", null, "ee"],
    ["ELEC 2026", "ubc", "ee"],
    ["Mechatronics Engineering", "waterloo", "mech"],
    ["Mechanical Engineering – Mechatronics Option", "ubc", "mech"],
    ["Mechatronic Systems Engineering", "sfu", "mech"],
    ["MSE", "sfu", "mech"],
    ["Computer Science", null, "cs"],
    ["BSc CPSC", "ubc", "cs"],
    ["CMPT major", "sfu", "cs"],
    ["Computing Science", "sfu", "cs"],
    ["ECE (Computer Engineering)", "waterloo", "ce"],
  ] as const)("%s at %s → %s", (text, uni, expected) => {
    const r = classifyDiscipline(text, uni);
    expect(r.value).toBe(expected);
    expect(r.confidence).toBe("confirmed");
  });

  it.each([
    ["Electrical and Computer Engineering", null, "more than one discipline"],
    ["Electrical & Computer Engineering", null, "more than one discipline"],
    ["ECE", "uoft", "more than one discipline"],
    ["Engineering Science", "uoft", "more than one discipline"],
    ["ENSC", "sfu", "more than one discipline"],
    ["MSE", "uoft", "Not one of the four"],
    ["ELEC", "sfu", "Not one of the four"],
    ["Mechanical Engineering", "ubc", "Mechatronics option"],
    ["Software Engineering", "waterloo", "Software engineering"],
    ["Computer Science and Computer Engineering double degree", null, "more than one target"],
    ["Engineering Science – Electrical and Computer option, Computer Engineering stream", "uoft", "more than one target"],
    ["Economics with a Computer Science minor", null, "minor"],
    ["Engineering", null, "Not one of the four"],
    ["", null, "No program"],
  ] as const)("sends %s at %s to review (%s)", (text, uni, reason) => {
    const r = classifyDiscipline(text, uni);
    expect(r.value).toBeNull();
    expect(r.confidence).toBe("needs_review");
    expect(r.reason).toContain(reason);
  });

  it("keeps EE and CE separate", () => {
    expect(classifyDiscipline("Electrical Engineering").value).toBe("ee");
    expect(classifyDiscipline("Computer Engineering").value).toBe("ce");
  });
});

describe("classifyCandidate", () => {
  it("uses the school to read course codes", () => {
    const r = classifyCandidate("University of British Columbia", "ELEC");
    expect(r.university.value).toBe("ubc");
    expect(r.discipline.value).toBe("ee");
  });
});
