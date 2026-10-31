import { describe, expect, it } from "vitest";
import { clampPane, PANE_MAX_REM, PANE_MIN_REM } from "./pane";

describe("clampPane", () => {
  it("keeps the width inside the allowed range", () => {
    expect(clampPane(5)).toBe(PANE_MIN_REM);
    expect(clampPane(500)).toBe(PANE_MAX_REM);
  });
  it("rounds to half a rem", () => {
    expect(clampPane(30.3)).toBe(30.5);
    expect(clampPane(30.2)).toBe(30);
  });
  it("leaves a good width alone", () => expect(clampPane(34)).toBe(34));
});
