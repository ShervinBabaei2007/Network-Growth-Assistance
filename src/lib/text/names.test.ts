import { describe, expect, it } from "vitest";
import { compareNames, jaroWinkler, nameTokens, normalizeName, splitName } from "./names";

describe("normalizeName", () => {
  it.each([
    ["Alex Chen", "alex chen"],
    ["  ALEX   CHEN ", "alex chen"],
    ["Dr. Alex J. Chen", "alex chen"],
    ["Alex Chen, P.Eng.", "alex chen"],
    ["Alex Chen PhD", "alex chen"],
    ["Chen, Alex", "alex chen"],
    ["José Martínez", "jose martinez"],
    ["Zoë O'Brien", "zoe obrien"],
    ["Alex (AJ) Chen", "alex chen"],
    ["Alex Chen 🚀", "alex chen"],
    ["Mary-Jane Watson", "mary watson"],
    ["Cher", "cher"],
    ["", ""],
  ])("%s → %s", (input, expected) => {
    expect(normalizeName(input)).toBe(expected);
  });

  it("keeps multi-part middle names out of the key but in the tokens", () => {
    expect(nameTokens("Ana Maria Lopez Garcia")).toEqual(["ana", "maria", "lopez", "garcia"]);
    expect(normalizeName("Ana Maria Lopez Garcia")).toBe("ana garcia");
  });
});

describe("splitName", () => {
  it("splits first and last as written", () => {
    expect(splitName("José  Martínez")).toEqual({ first: "José", last: "Martínez" });
    expect(splitName("Cher")).toEqual({ first: "Cher", last: null });
  });
});

describe("compareNames", () => {
  it("treats formatting differences as exact", () => {
    expect(compareNames("Dr. Alex Chen", "alex chen").kind).toBe("exact");
  });
  it("recognizes nicknames only with the same surname", () => {
    expect(compareNames("Alex Chen", "Alexander Chen").kind).toBe("nickname");
    expect(compareNames("Alex Chen", "Alexander Wong").kind).toBe("different");
  });
  it("allows small typos", () => {
    expect(compareNames("Jonathan Smith", "Jonathon Smith").kind).toBe("fuzzy");
  });
  it("keeps different people apart", () => {
    expect(compareNames("John Smith", "Jane Smith").kind).toBe("different");
    expect(compareNames("Alex Chen", "Alex Cheng").kind).not.toBe("exact");
  });
});

describe("jaroWinkler", () => {
  it("is 1 for equal strings and lower for different ones", () => {
    expect(jaroWinkler("martha", "martha")).toBe(1);
    expect(jaroWinkler("martha", "marhta")).toBeCloseTo(0.961, 2);
    expect(jaroWinkler("abc", "xyz")).toBe(0);
  });
});
