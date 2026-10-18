import { describe, expect, it } from "vitest";
import { formatters, isLocale, LOCALES, MESSAGES, negotiateLocale, translate, translator } from "./index";
import { en } from "./messages/en";
import { frCA } from "./messages/fr-CA";

function flatten(node: unknown, prefix = ""): Record<string, string> {
  if (typeof node === "string") return { [prefix]: node };
  return Object.fromEntries(Object.entries(node as object).flatMap(([k, v]) => Object.entries(flatten(v, prefix ? `${prefix}.${k}` : k))));
}
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("translations stay in step with English", () => {
  const english = flatten(en);
  for (const locale of LOCALES) {
    const messages = flatten(MESSAGES[locale]);
    it(`${locale} has exactly the English keys`, () => {
      expect(Object.keys(messages).sort()).toEqual(Object.keys(english).sort());
    });
    it(`${locale} has no empty text and keeps every placeholder`, () => {
      for (const [key, text] of Object.entries(messages)) {
        expect(text.length, key).toBeGreaterThan(0);
        expect(placeholders(text), key).toEqual(placeholders(english[key]!));
      }
    });
  }

  it("French is actually translated, apart from names that stay the same", () => {
    const fr = flatten(frCA);
    const sameAllowed = new Set(["common.appName", "auth.title", "nav.notifications", "nav.disciplines", "welcome.title0"]);
    const untranslated = Object.keys(fr).filter((k) => fr[k] === english[k] && !sameAllowed.has(k));
    expect(untranslated).toEqual([]);
  });
});

describe("translate", () => {
  it("fills placeholders and handles each language", () => {
    expect(translate("en", "welcome.stepOf", { step: 2, total: 4 })).toBe("Step 2 of 4");
    expect(translate("fr-CA", "welcome.stepOf", { step: 2, total: 4 })).toBe("Étape 2 sur 4");
    expect(translator("fr-CA")("nav.overview")).toBe("Aperçu");
  });
  it("leaves an unknown placeholder visible instead of dropping it", () => {
    expect(translate("en", "welcome.stepOf", { step: 1 })).toBe("Step 1 of {total}");
  });
  it("falls back to English, then to the key, for a missing message", () => {
    expect(translate("fr-CA", "no.such.key" as never)).toBe("no.such.key");
  });
});

describe("choosing a language", () => {
  it("recognises supported locales only", () => {
    expect(isLocale("fr-CA")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
  it("negotiates from Accept-Language, treating any French as Canadian French", () => {
    expect(negotiateLocale("fr-CA,fr;q=0.9,en;q=0.8")).toBe("fr-CA");
    expect(negotiateLocale("fr-FR")).toBe("fr-CA");
    expect(negotiateLocale("en-US,en;q=0.9")).toBe("en");
    expect(negotiateLocale("de-DE,de;q=0.9")).toBe("en");
    expect(negotiateLocale(null)).toBe("en");
  });
});

describe("formatters", () => {
  it("formats numbers, money and dates the Canadian way in each language", () => {
    const fr = formatters("fr-CA");
    const en = formatters("en");
    expect(en.number(1234567.5)).toBe("1,234,567.5");
    expect(fr.number(1234567.5).replace(/\s/g, " ")).toBe("1 234 567,5");
    expect(en.currency(1234.5)).toBe("$1,234.50");
    expect(fr.currency(1234.5).replace(/\s/g, " ")).toBe("1 234,50 $");
    expect(fr.date("2026-10-18T12:00:00Z", { dateStyle: "long" }, "UTC")).toBe("18 octobre 2026");
    expect(en.date("2026-10-18T12:00:00Z", { dateStyle: "long" }, "UTC")).toBe("October 18, 2026");
  });
});
