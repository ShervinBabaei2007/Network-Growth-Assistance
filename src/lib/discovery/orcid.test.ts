import { describe, expect, it } from "vitest";
import { testCriteria } from "@/test/discovery";
import { evaluateCriteria } from "./evidence";
import { draftFromOrcid, identityKeys } from "./extract";
import { FIXTURE_ORCID } from "./fixtures";
import { parseRequestDeterministic } from "./parse-request";
import { planQueries } from "./planner";
import { orcidProfileFromRecord } from "./providers/orcid";
import { scorePerson } from "./score";

const criteria = testCriteria("Find 20 UofT Computer Engineering alumni working as software engineers");

describe("orcidProfileFromRecord", () => {
  it("reads name, biography, links, education and employment", () => {
    const record = {
      person: {
        name: { "given-names": { value: "Nadia" }, "family-name": { value: "Rahman" }, "credit-name": null },
        biography: { content: "Engineer. " },
        "researcher-urls": { "researcher-url": [{ url: { value: "https://nadia.example.dev" } }] },
      },
      "activities-summary": {
        educations: {
          "affiliation-group": [
            {
              summaries: [
                {
                  "education-summary": {
                    "department-name": "Electrical & Computer Engineering",
                    "role-title": "BASc, Computer Engineering",
                    "start-date": { year: { value: "2018" } },
                    "end-date": { year: { value: "2022" } },
                    organization: { name: "University of Toronto", address: { city: "Toronto" } },
                  },
                },
              ],
            },
          ],
        },
        employments: { "affiliation-group": [] },
      },
    };
    expect(orcidProfileFromRecord("0009-0000-0000-0001", record)).toEqual({
      orcidId: "0009-0000-0000-0001",
      name: "Nadia Rahman",
      biography: "Engineer.",
      urls: ["https://nadia.example.dev"],
      countries: [],
      educations: [{ organization: "University of Toronto", city: "Toronto", country: null, department: "Electrical & Computer Engineering", role: "BASc, Computer Engineering", startYear: 2018, endYear: 2022 }],
      employments: [],
      htmlUrl: "https://orcid.org/0009-0000-0000-0001",
    });
  });
});

describe("draftFromOrcid", () => {
  it("turns education and current employment into evidence without any AI", () => {
    const d = draftFromOrcid(FIXTURE_ORCID[0], criteria)!;
    expect(d.facts.map((f) => [f.field, f.value])).toEqual([
      ["institution", "University of Toronto"],
      ["program", "Computer Engineering"],
      ["grad_year", "2022"],
      ["company", "Microsoft"],
      ["role", "Software Engineer"],
      ["location", "Vancouver, Canada"],
    ]);
    expect(d.facts[0].extractedText).toBe("Education: University of Toronto — Electrical & Computer Engineering — BASc, Computer Engineering (2018–2022)");
    expect(d.personalWebsite).toBe("https://nadia.example.dev");
    expect(identityKeys(d)).toContain("orcid:0009-0000-0000-0001");
    const s = scorePerson(evaluateCriteria(d.facts, criteria), d.facts);
    expect(s.tier).toBe("verified");
  });

  it("working at the school is not studying there", () => {
    expect(draftFromOrcid(FIXTURE_ORCID[1], criteria)).toBeNull();
  });

  it("uses the biography when there's no education entry", () => {
    const d = draftFromOrcid(
      { ...FIXTURE_ORCID[0], educations: [], employments: [], biography: "I studied Computer Engineering at the University of Toronto. Now a backend developer." },
      criteria,
    )!;
    expect(d.facts.find((f) => f.field === "institution")?.extractedText).toBe("I studied Computer Engineering at the University of Toronto.");
    expect(d.facts.find((f) => f.field === "role")?.extractedText).toBe("Now a backend developer.");
  });

});

describe("planner and parser without AI", () => {
  it("plans ORCID queries in its search syntax", () => {
    const orcid = planQueries(criteria).filter((p) => p.provider === "orcid");
    expect(orcid[0].query).toBe('affiliation-org-name:"University of Toronto" AND text:"Computer Engineering"');
    expect(orcid.every((p) => !p.query.includes("linkedin"))).toBe(true);
  });

  it("recognizes schools outside the built-in list", () => {
    expect(parseRequestDeterministic("Find 10 McGill University software engineers").education.institution).toBe("McGill University");
    expect(parseRequestDeterministic("Find people from the University of Ottawa working at Shopify").education.institution).toBe("University of Ottawa");
    expect(parseRequestDeterministic("Find 10 software engineers").education.institution).toBeNull();
  });
});
