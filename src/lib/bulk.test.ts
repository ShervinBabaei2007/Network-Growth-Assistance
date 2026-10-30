import { describe, expect, it } from "vitest";
import { cleanTag, groupBy, MAX_TAGS, MAX_TAG_LENGTH, withoutTag, withTag } from "./bulk";

describe("withTag", () => {
  it("adds a new tag", () => expect(withTag(["a"], "b")).toEqual(["a", "b"]));
  it("ignores a duplicate regardless of case and returns the same array", () => {
    const tags = ["UBC"];
    expect(withTag(tags, "ubc")).toBe(tags);
  });
  it("refuses to grow past the cap", () => {
    const full = Array.from({ length: MAX_TAGS }, (_, i) => `t${i}`);
    expect(withTag(full, "extra")).toBe(full);
  });
  it("ignores an empty tag", () => expect(withTag(["a"], "")).toEqual(["a"]));
});

describe("withoutTag", () => {
  it("removes case-insensitively", () => expect(withoutTag(["UBC", "x"], "ubc")).toEqual(["x"]));
  it("returns the same array when absent", () => {
    const tags = ["x"];
    expect(withoutTag(tags, "y")).toBe(tags);
  });
});

describe("cleanTag", () => {
  it("trims and caps the length", () => {
    expect(cleanTag("  hi  ")).toBe("hi");
    expect(cleanTag("x".repeat(100))).toHaveLength(MAX_TAG_LENGTH);
  });
});

describe("groupBy", () => {
  it("groups ids by key", () => {
    const g = groupBy([{ id: "1", p: "a" }, { id: "2", p: "b" }, { id: "3", p: "a" }], (r) => r.p, (r) => r.id);
    expect(g.get("a")).toEqual(["1", "3"]);
    expect(g.get("b")).toEqual(["2"]);
  });
});
