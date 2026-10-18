import { describe, expect, it } from "vitest";
import { cleanQuery, escapeLike, orIlike } from "./palette";

describe("cleanQuery", () => {
  it("needs at least two characters", () => {
    expect(cleanQuery("a")).toBeNull();
    expect(cleanQuery("  ")).toBeNull();
    expect(cleanQuery(null)).toBeNull();
    expect(cleanQuery("ab")).toBe("ab");
  });
  it("collapses spaces and limits length", () => {
    expect(cleanQuery("  maya   chen ")).toBe("maya chen");
    expect(cleanQuery("x".repeat(500))?.length).toBe(80);
  });
});

describe("escapeLike", () => {
  it("escapes wildcards and the escape character", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });
});

describe("orIlike", () => {
  it("matches any column", () => {
    expect(orIlike(["title", "company"], "dev")).toBe("title.ilike.%dev%,company.ilike.%dev%");
  });
  it("cannot break out of the filter", () => {
    const f = orIlike(["title"], 'x),id.eq.1,(y"');
    expect(f).toBe("title.ilike.%x id.eq.1 y%");
    expect(f.split(",")).toHaveLength(1);
  });
});
