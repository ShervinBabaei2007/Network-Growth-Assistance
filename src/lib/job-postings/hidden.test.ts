import { describe, expect, it } from "vitest";
import { hiddenBy, normalizePattern } from "./hidden";

describe("hidden filters", () => {
  it("normalise case and spaces", () => {
    expect(normalizePattern("  Acme   Corp ")).toBe("acme corp");
  });

  it("a company filter matches the whole name only", () => {
    const f = [{ kind: "company" as const, pattern: "acme" }];
    expect(hiddenBy({ title: "Dev", company: "ACME" }, f)).toEqual(f[0]);
    expect(hiddenBy({ title: "Dev", company: "Acme Labs" }, f)).toBeNull();
    expect(hiddenBy({ title: "Dev", company: null }, f)).toBeNull();
  });

  it("a title filter matches anywhere in the title", () => {
    const f = [{ kind: "title" as const, pattern: "intern" }];
    expect(hiddenBy({ title: "Software  Intern (Summer)", company: "X" }, f)).toEqual(f[0]);
    expect(hiddenBy({ title: "Developer", company: "X" }, f)).toBeNull();
  });

  it("no filters hides nothing", () => {
    expect(hiddenBy({ title: "Dev", company: "X" }, [])).toBeNull();
  });
});
