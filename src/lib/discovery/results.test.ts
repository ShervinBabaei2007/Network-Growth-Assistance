import { describe, expect, it } from "vitest";
import { locationOrigin, sourceName } from "./results";

describe("card provenance", () => {
  it("names ORCID and GitHub, and otherwise the website", () => {
    expect(sourceName({ sourceTitle: "ORCID · Ada Lovelace", sourceUrl: "https://orcid.org/0000-0000-0000-0001" })).toBe("ORCID");
    expect(sourceName({ sourceTitle: "GitHub · ada", sourceUrl: "https://github.com/ada" })).toBe("GitHub");
    expect(sourceName({ sourceTitle: "Team | Example Lab", sourceUrl: "https://www.example.org/team" })).toBe("example.org");
  });

  it("says when the location only comes from the employer's office", () => {
    const fact = (extractedText: string) => ({ field: "location" as const, value: "Vancouver, Canada", extractedText, confidence: "medium" as const });
    expect(locationOrigin([fact("Employment: Microsoft — Software Engineer (2022–present) · Vancouver, Canada")], "Vancouver, Canada")).toBe("employer");
    expect(locationOrigin([fact("Employment: Microsoft · Vancouver, Canada"), fact("Based in Vancouver")], "Vancouver, Canada")).toBe("person");
    expect(locationOrigin([], null)).toBeNull();
  });
});
