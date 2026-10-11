import { describe, expect, it } from "vitest";
import { classifyCountry, countryName, inCountry } from "./location";

describe("classifyCountry", () => {
  it.each([
    ["Toronto", "canada"],
    ["Toronto, ON", "canada"],
    ["Vancouver, BC", "canada"],
    ["Montréal, Québec", "canada"],
    ["Waterloo, Ontario, Canada", "canada"],
    ["GTA", "canada"],
    ["London, ON", "canada"],
    ["Canada 🇨🇦", "canada"],
    ["Seattle, WA", "other"],
    ["San Francisco, CA", "other"],
    ["Vancouver, WA", "other"],
    ["New York", "other"],
    ["Bay Area", "other"],
    ["London, UK", "other"],
    ["Bangalore, India", "other"],
    ["Berlin", "other"],
    ["Remote", null],
    ["London", null],
    ["Earth", null],
    ["", null],
  ])("%s → %s", (loc, expected) => {
    expect(classifyCountry(loc)).toBe(expected);
  });
});

describe("inCountry", () => {
  it("checks Canada in detail and other countries by name", () => {
    expect(inCountry("Vancouver, BC", "Canada")).toBe("in");
    expect(inCountry("Austin, TX", "Canada")).toBe("out");
    expect(inCountry("Remote", "Canada")).toBeNull();
    expect(inCountry("Berlin, Germany", "Germany")).toBe("in");
    expect(inCountry("Toronto", "Germany")).toBe("out");
  });

  it("names ISO codes", () => {
    expect(countryName("CA")).toBe("Canada");
    expect(countryName("us")).toBe("United States");
    expect(countryName(null)).toBeNull();
  });
});
