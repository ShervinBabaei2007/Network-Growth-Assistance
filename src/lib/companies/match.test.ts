import { describe, expect, it } from "vitest";
import { companyKey, companySlug, keyFromSlug, matchCompany, pairKey } from "./match";

const level = (a: string, b: string, d: Parameters<typeof matchCompany>[2] = []) => matchCompany(a, b, d).level;

describe("companyKey", () => {
  it("drops trailing legal suffixes only", () => {
    expect(companyKey("Acme Software, Inc.")).toBe("acme software");
    expect(companyKey("Co-operators")).toBe("co operators");
    expect(companyKey("Labs Co.")).toBe("labs");
    expect(companyKey("Amazon Canada Inc.")).toBe("amazon canada");
    expect(companyKey(null)).toBe("");
  });

  it("round-trips through a page slug", () => {
    expect(keyFromSlug(companySlug("Northwind Labs, Inc."))).toBe("northwind labs");
  });
});

describe("matchCompany", () => {
  it("counts the same name as the same company", () => {
    expect(level("Amazon Web Services, Inc.", "amazon web services")).toBe("same");
  });

  it("only suggests regional and group names", () => {
    expect(level("Amazon Canada", "Amazon")).toBe("possible");
    expect(level("AWS", "Amazon")).toBe("possible");
    expect(level("Amazon Web Services", "Amazon")).toBe("possible");
    expect(level("Facebook", "Meta")).toBe("possible");
    expect(level("Northwind Labs Canada", "Northwind Labs")).toBe("possible");
  });

  it("keeps different companies apart", () => {
    expect(level("Apple", "Applied Materials")).toBe("different");
    expect(level("Co-operators", "Operators Inc")).toBe("different");
    expect(level("IBM", "Intel")).toBe("different");
  });

  it("suggests a whole-word prefix but never decides it", () => {
    expect(level("Apple", "Apple Hospitality REIT")).toBe("possible");
  });

  it("follows the user's decision, either way round", () => {
    const [aKey, bKey] = pairKey("apple", "apple hospitality reit");
    expect(level("Apple Hospitality REIT", "Apple", [{ aKey, bKey, decision: "different" }])).toBe("different");
    const [x, y] = pairKey("amazon canada", "amazon");
    expect(level("Amazon", "Amazon Canada", [{ aKey: x, bKey: y, decision: "same" }])).toBe("alias");
  });

  it("never matches a missing name", () => {
    expect(level("", "Acme")).toBe("different");
  });
});
