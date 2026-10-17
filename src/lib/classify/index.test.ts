import { describe, expect, it } from "vitest";
import { EMPTY_CATALOG } from "@/lib/domain";
import { NURSING_CATALOG, TEST_CATALOG } from "@/test/catalog";
import { classifyCandidate, classifyDiscipline, classifyUniversity, phrasesFor } from "./index";

describe("classifyUniversity: the user's own schools", () => {
  it.each([
    ["University of Toronto", "uoft"],
    ["Student at U of T", "uoft"],
    ["UofT Engineering '27", "uoft"],
    ["University of British Columbia", "ubc"],
    ["UBC Vancouver", "ubc"],
    ["Simon Fraser University", "sfu"],
  ])("%s → %s", (text, id) => {
    expect(classifyUniversity(text, TEST_CATALOG)).toMatchObject({ value: id, confidence: "confirmed" });
  });

  it("matches whole words only, so a school's name inside another word doesn't count", () => {
    expect(classifyUniversity("Subcontractor", TEST_CATALOG).value).toBeNull();
  });

  it("sends unclear cases to review", () => {
    expect(classifyUniversity("", TEST_CATALOG)).toMatchObject({ value: null, confidence: "needs_review", reason: "No school given." });
    expect(classifyUniversity("UBC and SFU exchange", TEST_CATALOG)).toMatchObject({ value: null, reason: "Mentions more than one of your schools." });
    expect(classifyUniversity("McGill University", TEST_CATALOG).reason).toMatch(/Not one of your schools/);
  });

  it("works for any field and any school the user adds", () => {
    expect(classifyUniversity("McGill School of Nursing", NURSING_CATALOG)).toMatchObject({ value: "mcgill", confidence: "confirmed" });
    expect(classifyUniversity("University of Toronto", NURSING_CATALOG).value).toBeNull();
  });

  it("matches nothing until the user adds schools", () => {
    expect(classifyUniversity("University of Toronto", EMPTY_CATALOG)).toMatchObject({ value: null, reason: expect.stringMatching(/haven't added any schools/) });
  });
});

describe("classifyDiscipline: the user's own disciplines", () => {
  it.each([
    ["Computer Engineering", "ce"],
    ["BASc Computer Engineering, 2027", "ce"],
    ["CPEN student", "ce"],
    ["Electrical Engineering", "ee"],
    ["Mechatronics", "mech"],
    ["BSc CPSC", "cs"],
    ["Computing Science", "cs"],
  ])("%s → %s", (text, id) => {
    expect(classifyDiscipline(text, TEST_CATALOG)).toMatchObject({ value: id, confidence: "confirmed" });
  });

  it("sends unclear cases to review", () => {
    expect(classifyDiscipline("", TEST_CATALOG).reason).toBe("No program given.");
    expect(classifyDiscipline("Computer Science and Computer Engineering double degree", TEST_CATALOG).reason).toBe("Mentions more than one of your disciplines.");
    expect(classifyDiscipline("Computer Science, minor in Economics", TEST_CATALOG).reason).toBe("Mentions a minor; confirm the major.");
    expect(classifyDiscipline("Biology", TEST_CATALOG).reason).toMatch(/Not one of your/);
  });

  it("works for a nursing student as well as an engineer", () => {
    expect(classifyDiscipline("BScN student", NURSING_CATALOG)).toMatchObject({ value: "nursing", confidence: "confirmed" });
    expect(classifyDiscipline("Registered Nurse, Nursing graduate", NURSING_CATALOG).value).toBe("nursing");
    expect(classifyDiscipline("Computer Engineering", NURSING_CATALOG).value).toBeNull();
  });
});

describe("classifyCandidate", () => {
  it("classifies both against the same lists", () => {
    const r = classifyCandidate("McGill University", "Bachelor of Nursing (BSN)", NURSING_CATALOG);
    expect(r.university).toMatchObject({ value: "mcgill", confidence: "confirmed" });
    expect(r.discipline).toMatchObject({ value: "nursing", confidence: "confirmed" });
  });
});

describe("phrasesFor", () => {
  it("uses the name and every spelling, cleaned and without duplicates", () => {
    expect(phrasesFor({ name: "UBC", aliases: ["ubc", "University of British Columbia"] })).toEqual(["ubc", "university of british columbia"]);
  });
});
