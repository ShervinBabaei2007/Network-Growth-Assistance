import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE, normalizeAppearance, parseAppearance, serializeAppearance } from "./appearance";

describe("appearance", () => {
  it("round-trips through the cookie value", () => {
    const a = { theme: "dark", density: "compact", text: "large" } as const;
    expect(parseAppearance(serializeAppearance(a))).toEqual(a);
  });

  it("falls back to defaults for anything unknown", () => {
    expect(parseAppearance(undefined)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance("neon.tiny.huge")).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance("light")).toEqual({ ...DEFAULT_APPEARANCE, theme: "light" });
    expect(normalizeAppearance({ theme: "<script>", density: "compact" })).toEqual({ ...DEFAULT_APPEARANCE, density: "compact" });
  });
});
