import { describe, expect, it } from "vitest";
import { ACCENTS, APPEARANCE_SCRIPT, CONTRASTS, DEFAULT_APPEARANCE, normalizeAppearance, parseAppearance, serializeAppearance } from "./appearance";

describe("appearance", () => {
  it("round-trips through the cookie value", () => {
    const a = { theme: "dark", density: "compact", text: "large", accent: "teal", contrast: "high" } as const;
    expect(parseAppearance(serializeAppearance(a))).toEqual(a);
  });

  it("falls back to defaults for anything unknown", () => {
    expect(parseAppearance(undefined)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance("neon.tiny.huge.plaid.extreme")).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance("light")).toEqual({ ...DEFAULT_APPEARANCE, theme: "light" });
    expect(normalizeAppearance({ theme: "<script>", density: "compact" })).toEqual({ ...DEFAULT_APPEARANCE, density: "compact" });
  });

  it("still reads a cookie written before accent and contrast existed", () => {
    expect(parseAppearance("dark.compact.large")).toEqual({ theme: "dark", density: "compact", text: "large", accent: "blue", contrast: "standard" });
  });

  it("every choice survives the round trip", () => {
    for (const accent of ACCENTS) for (const contrast of CONTRASTS) {
      const a = { ...DEFAULT_APPEARANCE, accent, contrast };
      expect(parseAppearance(serializeAppearance(a))).toEqual(a);
    }
  });

  it("the pre-paint script knows every accent, so none flashes blue first", () => {
    for (const accent of ACCENTS) expect(APPEARANCE_SCRIPT).toContain(`"${accent}"`);
    expect(APPEARANCE_SCRIPT).toContain("dataset.contrast");
  });
});
