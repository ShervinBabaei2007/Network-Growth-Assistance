import { describe, expect, it } from "vitest";
import { ANYWHERE, countryCode, countryName, countryOptions, currencyOf, readPlace, regionsOf, scopeFor } from "./countries";

describe("countries", () => {
  it("names and codes", () => {
    expect(countryName("CA")).toBe("Canada");
    expect(countryName("*")).toBe("Anywhere (remote)");
    expect(countryCode("CAN")).toBe("CA");
    expect(countryCode("United States")).toBe("US");
    expect(countryCode("uk")).toBe("GB");
    expect(countryCode("Deutschland")).toBe("DE");
    expect(countryCode("Narnia")).toBeNull();
    expect(countryOptions().length).toBeGreaterThan(230);
  });

  it("regions and scopes", () => {
    expect(regionsOf("DE")).toEqual(expect.arrayContaining(["europe", "emea"]));
    expect(regionsOf("BR")).toEqual(expect.arrayContaining(["latam", "americas"]));
    expect(scopeFor("CA")).toEqual(["CA", "north-america", "americas", ANYWHERE]);
    expect(scopeFor(ANYWHERE)).toEqual([ANYWHERE]);
    expect(currencyOf("GB")).toBe("GBP");
    expect(currencyOf("ZZ")).toBeNull();
  });
});

describe("readPlace", () => {
  it("prefers structured fields", () => {
    expect(readPlace({ text: "London", country: "GB" })).toMatchObject({ scope: ["GB"], country: "GB", region: null });
    expect(readPlace({ text: "London", region: "ON", country: "CA" })).toMatchObject({ country: "CA", region: "ON" });
    expect(readPlace({ text: "Vancouver, WA", country: "US" })).toMatchObject({ country: "US", region: "WA" });
  });

  it("reads Canada, its provinces and cities", () => {
    expect(readPlace({ text: "Toronto, ON" })).toMatchObject({ country: "CA", region: "ON", city: "Toronto" });
    expect(readPlace({ text: "Vancouver, British Columbia, Canada" })).toMatchObject({ country: "CA", region: "BC" });
    expect(readPlace({ text: "Vancouver" })).toMatchObject({ country: "CA", region: "BC" });
    expect(readPlace({ text: "Remote - Canada" })).toMatchObject({ scope: ["CA"], country: "CA", region: null, city: null });
  });

  it("reads the US, its states and cities", () => {
    expect(readPlace({ text: "Vancouver, WA" })).toMatchObject({ country: "US", region: "WA" });
    expect(readPlace({ text: "San Francisco, CA" })).toMatchObject({ country: "US", region: "CA" });
    expect(readPlace({ text: "Atlanta, Georgia" })).toMatchObject({ country: "US", region: "GA" });
    expect(readPlace({ text: "Newark, New Jersey" })).toMatchObject({ country: "US", region: "NJ" });
    expect(readPlace({ text: "Albuquerque, New Mexico" })).toMatchObject({ country: "US", region: "NM" });
    expect(readPlace({ text: "Remote - US" })).toMatchObject({ scope: ["US"], country: "US" });
    expect(readPlace({ text: "Seattle" })).toMatchObject({ country: "US" });
  });

  it("reads other countries and doesn't confuse a country with a state", () => {
    expect(readPlace({ text: "Tbilisi, Georgia" })).toMatchObject({ country: "GE" });
    expect(readPlace({ text: "Berlin" })).toMatchObject({ country: "DE", city: "Berlin" });
    expect(readPlace({ text: "London, England" })).toMatchObject({ country: "GB" });
    expect(readPlace({ text: "London, UK" })).toMatchObject({ country: "GB" });
    expect(readPlace({ text: "Bengaluru, Karnataka, India" })).toMatchObject({ country: "IN" });
    expect(readPlace({ text: "Ciudad de México" })).toMatchObject({ country: "MX" });
  });

  it("reads remote scopes: regions and anywhere", () => {
    expect(readPlace({ text: "Remote - EMEA" })).toMatchObject({ scope: ["emea"], country: null });
    expect(readPlace({ text: "Remote (Europe)" }).scope).toEqual(["europe"]);
    expect(readPlace({ text: "Anywhere in the world" }).scope).toEqual([ANYWHERE]);
    expect(readPlace({ text: "Canada, USA" })).toMatchObject({ country: null });
    expect(readPlace({ text: "Canada, USA" }).scope.sort()).toEqual(["CA", "US"]);
  });

  it("leaves what it can't read unknown", () => {
    expect(readPlace({ text: "Remote" }).scope).toEqual([]);
    expect(readPlace({ text: "London" }).scope).toEqual([]);
    expect(readPlace({ text: "Remote (join us!)" }).scope).toEqual([]);
    expect(readPlace({ text: "" }).scope).toEqual([]);
  });
});
